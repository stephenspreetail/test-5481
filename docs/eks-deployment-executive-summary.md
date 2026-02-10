# Kova EKS Deployment - Executive Summary

## Quick Links

- **[Main Deployment Plan](./eks-deployment-plan.md)** - Comprehensive deployment guide with architecture, CI/CD, Helm charts, security
- **[Additional Details](./eks-deployment-plan-addendum.md)** - Multi-image builds, storage, networking, monitoring, costs, DR
- **[Cross-Cluster Technical Details](./cross-cluster-orchestration-details.md)** - Deep dive on cross-cluster implementation

## Overview

Deploy Kova to AWS EKS with **cross-cluster orchestration** architecture:

```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ dev01-eks-kova              │      │ dev01-eks-ops               │
│ (Kova Platform)             │      │ (User Apps)                 │
│                             │      │                             │
│  • Backend API (Bun)        │══════▶  • User App Pods            │
│  • Frontend UI (React)      │      │  • Isolated workspaces      │
│  • Cross-cluster kubectl    │      │  • Istio preview URLs       │
│  • Pod Identity (Bedrock)   │      │  • Pod Identity (Bedrock)   │
└─────────────────────────────┘      └─────────────────────────────┘
```

## Key Architecture Decisions

### 1. Cross-Cluster Orchestration ✅

**Decision**: Backend in kova cluster, user apps in ops cluster

**Why**:
- ✅ Isolation: User apps can't affect Kova platform stability
- ✅ Security: Separate blast radius for untrusted user code
- ✅ Scalability: Scale user app cluster independently
- ✅ Multi-tenancy: Future possibility for per-customer clusters

**Implementation**:
- Pod Identity for authentication to ops cluster
- RBAC in ops cluster grants pod CRUD permissions
- Mounted kubeconfig secret for cross-cluster access
- Port-forward for backend-to-app communication (MVP)

### 2. Multi-Image Build Strategy ✅

**Three Docker images**:
1. **kova-backend** - Bun/Fastify API server
2. **kova-web** - React SPA (nginx)
3. **kova-app-container** - User app runtime (@kova/agent)

**Pipeline**: Single multi-project pipeline (like dotnet-multi-project.yml pattern)

### 3. LLM Provider: AWS Bedrock ✅

**Decision**: Use Bedrock with Pod Identity (not Azure Foundry)

**Why**:
- ✅ No credential management (Pod Identity auto-discovers)
- ✅ Built-in IAM policies (fine-grained permissions)
- ✅ Cost-effective (Sonnet default, Opus optional)
- ✅ Already integrated in codebase

**Configuration**:
- LLM_PROVIDER=bedrock
- Two IAM roles: kova-backend-role, kova-app-role
- Separate Pod Identity associations per cluster

### 4. Storage: EBS PersistentVolumes ✅

**Decision**: EBS gp3 PersistentVolumeClaim per app (dev), EFS shared storage (prod)

**Why**:
- ✅ Simple and reliable
- ✅ Automatic cleanup on app deletion
- ✅ Affordable (~$0.40/app/month)
- ✅ Upgrade path to EFS for prod

### 5. Networking: Port-Forward (MVP) → VPC Peering (Prod) ✅

**MVP**: kubectl port-forward for backend-to-app communication
**Future**: VPC Peering + Route53 for direct service access

**Why**:
- ✅ Port-forward is quick to implement (no infrastructure changes)
- ✅ VPC Peering is better for production (lower latency, more reliable)
- ✅ Clear upgrade path

## Implementation Checklist

### Phase 1: Pre-Deployment Setup (Week 1)

**AWS Resources**:
- [ ] Create IAM role: `dev-kova-backend-role` (Bedrock + EKS DescribeCluster)
- [ ] Create IAM role: `dev-kova-app-role` (Bedrock only)
- [ ] Create IAM policies and attach to roles
- [ ] Create Pod Identity associations (kova cluster + ops cluster)
- [ ] Create RDS PostgreSQL instance (or use existing)
- [ ] Create ECR repositories (kova-backend, kova-web, kova-app-container)

**Kubernetes - Kova Cluster** (`dev01-eks-kova`):
- [ ] Create namespace: `kova`
- [ ] Generate ops cluster kubeconfig
- [ ] Create secret: `ops-kubeconfig` (from generated kubeconfig)

**Kubernetes - Ops Cluster** (`dev01-eks-ops`):
- [ ] Create namespace: `kova-apps`
- [ ] Create ServiceAccount: `kova-app-container` (with Pod Identity annotation)
- [ ] Apply ClusterRole: `kova-orchestrator` (pod CRUD permissions)
- [ ] Apply ClusterRoleBinding: bind role to Kova IAM role
- [ ] Update aws-auth ConfigMap (add kova-backend IAM role)

**GitLab CI/CD**:
- [ ] Add masked variables: JWT_SECRET, ENCRYPTION_KEY, DB_PASSWORD
- [ ] Add variables: DATABASE_URL, ANTHROPIC_API_KEY (if not using Bedrock)
- [ ] Add variables: PROGET_API_KEY, DATA_PLATFORM_*

### Phase 2: Code & Configuration (Week 1-2)

**Backend Code**:
- [ ] Add cross-cluster config to `backend/src/config/index.ts`
- [ ] Update `backend/src/services/k8s-environment.service.ts`
- [ ] Update `backend/src/services/orchestrator/kubectl.orchestrator.ts`
- [ ] Add port-forward support to orchestrator
- [ ] Update LLM provider service (if needed for Bedrock)

**Helm Charts**:
- [ ] Create `helm/kova/Chart.yaml`
- [ ] Create `helm/kova/values-default.yaml`
- [ ] Create `helm/kova/values-dev.yaml`
- [ ] Create `helm/kova/templates/deployment.yaml`
- [ ] Create `helm/kova/templates/service.yaml`
- [ ] Create `helm/kova/templates/serviceaccount.yaml`
- [ ] Create `helm/kova/templates/ingress.yaml` (Istio VirtualService)

**Dockerfiles**:
- [ ] Optimize `backend/Dockerfile` (multi-stage build with Bun)
- [ ] Create/update `Dockerfile.web` (nginx + SPA)
- [ ] Verify `Dockerfile.appcontainer` is prod-ready

**CI/CD Pipeline**:
- [ ] Create `.gitlab-ci.yml` (node-single-build.yml or custom multi-project)
- [ ] Add multi-image build jobs (backend, web, app-container)
- [ ] Configure HELM_ARGS with all env vars
- [ ] Set up environment-specific variables

### Phase 3: Deployment & Testing (Week 2-3)

**Initial Deployment**:
- [ ] Push code to GitLab
- [ ] Trigger pipeline
- [ ] Run release_dev_aws job (manual)
- [ ] Verify backend pod running in kova cluster
- [ ] Check backend logs for errors

**Verification**:
- [ ] Backend can assume IAM role: `aws sts get-caller-identity`
- [ ] Backend can access ops cluster: `kubectl get nodes`
- [ ] Backend can call Bedrock: check title generation works
- [ ] UI is accessible: https://kova.eks.dev01.tk.dev

**App Creation Test**:
- [ ] Create test app via UI
- [ ] Verify pod created in ops cluster: `kubectl get pods -n kova-apps`
- [ ] Verify app pod can assume IAM role
- [ ] Verify app can call Bedrock: check agent logs
- [ ] Verify preview URL works: https://kova-app-X.kova-apps.eks.dev01.tk.dev
- [ ] Test LLM streaming via WebSocket
- [ ] Test app hot-reload on code changes

**Cross-Cluster Communication**:
- [ ] Verify backend can port-forward to app pod
- [ ] Test agent API calls (backend → app)
- [ ] Check latency/performance
- [ ] Monitor for port-forward stability issues

### Phase 4: Production Readiness (Week 3-4)

**Security Hardening**:
- [ ] Apply NetworkPolicies (kova cluster + ops cluster)
- [ ] Enable Pod Security Standards (restricted for backend, baseline for apps)
- [ ] Scan images with Snyk (should be in pipeline)
- [ ] Review IAM policies (least privilege)
- [ ] Rotate secrets (JWT_SECRET, ENCRYPTION_KEY)

**Monitoring & Observability**:
- [ ] Add Prometheus metrics endpoint to backend
- [ ] Create ServiceMonitor for metrics collection
- [ ] Set up CloudWatch Logs (Fluent Bit DaemonSet)
- [ ] Create dashboards (pod count, LLM usage, latency)
- [ ] Set up alerts (pod crashes, high latency, Bedrock errors)

**Documentation**:
- [ ] Update README with EKS deployment instructions
- [ ] Create operational runbook
- [ ] Document troubleshooting procedures
- [ ] Create architecture diagrams
- [ ] Document cost estimates

**Performance & Optimization**:
- [ ] Load testing (concurrent app creations)
- [ ] Optimize pod resource requests/limits
- [ ] Implement HPA for backend (if needed)
- [ ] Pre-pull app-container image (DaemonSet)
- [ ] Test autoscaling (Karpenter)

**Disaster Recovery**:
- [ ] Set up Velero backups (kova namespace)
- [ ] Test backup/restore procedure
- [ ] RDS automated backups configured
- [ ] Document recovery procedures

### Phase 5: Rollout to Test/Prod (Week 4+)

**Test Environment**:
- [ ] Repeat Phase 1-3 for test environment
- [ ] User acceptance testing
- [ ] Performance testing
- [ ] Security review

**Production Environment**:
- [ ] Repeat Phase 1-3 for production environment
- [ ] Blue-green deployment strategy
- [ ] Rollback plan documented
- [ ] On-call rotation established
- [ ] Monitoring and alerting verified

## Cost Estimate

### Dev Environment (~$400/month)
- **EKS Nodes**: $350/month (5x m5.large)
- **RDS**: $30/month (db.t3.small)
- **EBS Storage**: $16/month (10 apps × 5GB)
- **ECR**: $0.30/month (3 images)

### Prod Environment (~$1,200/month)
- **EKS Nodes**: $1,050/month (15x m5.large, multi-AZ)
- **RDS**: $100/month (db.r6g.large, multi-AZ)
- **EFS Storage**: $60/month (200GB shared)
- **ECR**: $1/month (more images/versions)

**Optimization Opportunities**:
- Use Spot instances (50-70% savings)
- Karpenter autoscaling (scale to zero at night)
- Bedrock Sonnet instead of Opus (3x cheaper)

## Success Criteria

**Technical**:
- ✅ Backend pod running in kova cluster
- ✅ User app pods created in ops cluster on demand
- ✅ Cross-cluster orchestration works reliably
- ✅ Preview URLs accessible via Istio Gateway
- ✅ LLM calls succeed (Bedrock via Pod Identity)
- ✅ Persistent storage works (app workspaces)

**Operational**:
- ✅ CI/CD pipeline runs successfully
- ✅ Security scans pass (Snyk, GitLeaks)
- ✅ Monitoring and alerts configured
- ✅ Backup/restore tested
- ✅ Runbook documented

**Performance**:
- ✅ App creation <30 seconds
- ✅ LLM response latency <5 seconds
- ✅ Preview URL load time <2 seconds
- ✅ Support 50+ concurrent apps

## Risk Assessment

### High Risk 🔴

**Cross-cluster networking reliability**:
- Risk: Port-forward connections may drop, affecting backend-to-app communication
- Mitigation: Implement retry logic, plan upgrade to VPC Peering
- Timeline: VPC Peering in Phase 4 (Week 3-4)

**Pod Identity permissions**:
- Risk: Incorrect IAM policies prevent Bedrock access
- Mitigation: Test thoroughly in dev, document policies clearly
- Timeline: Test in Phase 3 (Week 2)

### Medium Risk 🟡

**Storage costs for user apps**:
- Risk: EBS costs scale linearly with app count
- Mitigation: Monitor costs, implement cleanup for inactive apps, consider EFS
- Timeline: Monitor in Phase 3, optimize in Phase 4

**Image pull performance**:
- Risk: First app creation slow due to image pull
- Mitigation: DaemonSet to pre-pull images on all nodes
- Timeline: Implement in Phase 4

### Low Risk 🟢

**CI/CD pipeline complexity**:
- Risk: Multi-image build may be complex to debug
- Mitigation: Use battle-tested ci-templates patterns
- Timeline: Phase 2

**Frontend deployment**:
- Risk: SPA routing may not work correctly
- Mitigation: nginx config with try_files fallback (already tested locally)
- Timeline: Phase 2

## Timeline

| Week | Phase | Key Activities |
|------|-------|----------------|
| 1 | Pre-Deployment + Code | AWS/K8s resource setup, code changes |
| 2 | Deployment + Testing | Deploy to dev, verify cross-cluster works |
| 3 | Production Readiness | Security, monitoring, performance testing |
| 4+ | Test/Prod Rollout | Deploy to test/prod, UAT, go-live |

**Target Go-Live**: End of Week 4

## Open Questions

1. **Database**: Use RDS or in-cluster PostgreSQL?
   - **Recommendation**: RDS (managed, backups, HA)
   - **Cost**: ~$30/month dev, ~$100/month prod

2. **VPC Peering timing**: MVP with port-forward, or wait for VPC Peering?
   - **Recommendation**: MVP with port-forward, upgrade to VPC Peering in Phase 4
   - **Reason**: Faster time to market, clear upgrade path

3. **Frontend separate deployment**: Deploy web and backend separately, or combined Helm chart?
   - **Recommendation**: Combined Helm chart (simpler version coordination)
   - **Reason**: Single release, no version skew issues

4. **Istio Gateway**: Already deployed in ops cluster?
   - **Action**: Verify with ops team, may need to deploy

5. **Autoscaling**: Enable HPA for backend from day 1, or add later?
   - **Recommendation**: Add in Phase 4 (not needed for MVP)
   - **Reason**: Start simple, add based on actual usage

## Next Steps (Immediate Actions)

1. **Review this plan** with team and stakeholders
2. **Confirm cluster names and namespaces** (dev01-eks-kova, dev01-eks-ops)
3. **Get database connection strings** (RDS or in-cluster)
4. **Verify Istio Gateway** is deployed in ops cluster
5. **Create IAM roles** (dev-kova-backend-role, dev-kova-app-role)
6. **Begin Phase 1** implementation

## Document Organization

```
docs/
├── eks-deployment-executive-summary.md   (this file)
├── eks-deployment-plan.md                (main deployment guide)
├── eks-deployment-plan-addendum.md       (additional details)
└── cross-cluster-orchestration-details.md (technical deep dive)
```

**Start with this summary, then dive into specific documents as needed.**

---

**Status**: Ready for review and approval
**Last Updated**: 2026-02-06
**Author**: Claude (AI Agent) + Gabe
**Next Review**: After team discussion
