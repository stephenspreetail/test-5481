# Podman on Windows Troubleshooting Guide

This guide covers common networking issues when running Kova with Podman on Windows (WSL2).

## Overview

Podman on Windows runs containers inside a WSL2 virtual machine. Port forwarding from containers to the Windows host goes through multiple layers:

```
Container (10.89.x.x:port) → WSL2 VM (iptables NAT) → Windows (localhost:port)
```

The most common issue is **stale iptables NAT rules** that persist across container restarts, causing connections to be forwarded to old/non-existent container IPs.

## Symptoms

- `ERR_EMPTY_RESPONSE` when accessing services (Traefik, app previews)
- `Connection terminated unexpectedly` from PostgreSQL
- `Connection refused` or connection timeouts
- Services work inside WSL but not from Windows

## Quick Diagnosis

### 1. Check if the port is listening on Windows

```powershell
netstat -an | findstr <PORT>
```

If it shows `LISTENING`, the port forwarding from WSL to Windows is working.

### 2. Check for stale iptables rules

```bash
podman machine ssh podman-machine-default "iptables -t nat -L -n | grep <PORT>"
```

Look for multiple `DNAT` rules pointing to different IPs. Example of a problem:

```
DNAT  tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:5433 to:10.89.1.3:5432  # OLD - stale!
DNAT  tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:5433 to:10.89.0.2:5432  # NEW - correct
```

The first matching rule wins, so stale rules cause traffic to go to the wrong IP.

### 3. Get the current container IP

```bash
podman inspect <container-name> | grep -E '"IPAddress".*[0-9]'
```

## Fix: Remove Stale iptables Rules

### Step 1: Identify the stale rule

```bash
podman machine ssh podman-machine-default "iptables-save -t nat | grep <PORT>"
```

This shows the exact chain and rule format. Look for rules pointing to IPs that don't match your current container.

### Step 2: Remove the stale rule

```bash
podman machine ssh podman-machine-default "iptables -t nat -D NETAVARK-DN-D7E590152FEA9 -p tcp -m tcp --dport <PORT> -j DNAT --to-destination <OLD_IP>:<CONTAINER_PORT>"
```

Replace:
- `<PORT>` - the host port (e.g., 5433, 8081)
- `<OLD_IP>` - the stale IP from the iptables output
- `<CONTAINER_PORT>` - the container's internal port

### Step 3: Verify the fix

```bash
podman machine ssh podman-machine-default "iptables -t nat -L -n | grep <PORT>"
```

Should now show only one DNAT rule pointing to the correct IP.

## Common Ports and Services

| Service | Host Port | Container Port | Container Name |
|---------|-----------|----------------|----------------|
| PostgreSQL | 5433 | 5432 | kova-postgres |
| Traefik | 8081 | 8081 | kova-traefik |
| App Preview | 8081 | 3000 | app-{id} |
| Agent API | 31100+ | 3100 | app-{id} |

## Prevention

### Full cleanup before restarting Podman

```bash
# Stop all containers
podman stop -a

# Remove all containers
podman rm -a

# Prune networks
podman network prune -f

# Now restart the machine
podman machine stop
podman machine start
```

### Nuclear option: Reset iptables

If you have many stale rules, restart the Podman machine and recreate containers:

```bash
podman machine stop
podman machine start

# Recreate services
cd /path/to/app-builder
podman compose up postgres traefik -d
```

## Podman TCP API Setup

Bun on Windows can't connect to Podman via named pipes. We use TCP instead.

### Auto-start TCP API (already configured)

A systemd service runs automatically when the Podman machine starts:

```bash
# Check status
podman machine ssh podman-machine-default "systemctl --user status podman-tcp.service"
```

### Update WSL IP in .env

The WSL IP can change after restarts. Run:

```bash
bun run start:podman
```

This updates `DOCKER_URL_HOST` in `.env` with the current IP.

**Note:** When using TCP mode, you need to set all three variables in `.env`:

```
DOCKER_USE_SOCKET=0
DOCKER_URL_HOST=<WSL2-IP>
DOCKER_URL_PORT=2375
```

### Manual TCP API start (if needed)

```bash
podman machine ssh podman-machine-default "podman system service --time=0 tcp:0.0.0.0:2375 &"
```

## Troubleshooting Checklist

1. [ ] Is Podman machine running? (`podman machine list`)
2. [ ] Is the container running? (`podman ps`)
3. [ ] Is the port listening on Windows? (`netstat -an | findstr <PORT>`)
4. [ ] Are there stale iptables rules? (see diagnosis above)
5. [ ] Is the WSL IP correct in `.env`? (`bun run start:podman`)
6. [ ] Is the Podman TCP API running? (check systemd service)

## Related Files

- `scripts/start-podman.ps1` - Updates WSL IP in .env
- `.env` - Contains `DOCKER_USE_SOCKET`, `DOCKER_URL_HOST`, and `DOCKER_URL_PORT` for TCP API connection
- `backend/src/services/app-container.service.ts` - Container orchestration
