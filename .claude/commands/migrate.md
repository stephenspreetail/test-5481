Mirror a GitLab repository into this GitHub repository using `migrate.py`.

Follow these steps:

1. Ask the user for their GitLab Personal Access Token (PAT) if they haven't already provided it in this conversation. Remind them it needs `read_api` and `read_repository` scope.

2. Run the migration script, passing the PAT via environment variable so it is never stored on disk:
   ```
   GITLAB_PAT=<their-token> python3 /home/user/test-5481/migrate.py
   ```

3. The script will list all accessible GitLab repos. Show the output to the user and ask them which number they want to select if the script doesn't handle the prompt interactively.

4. After the user confirms the mirror, the script clones the chosen GitLab repo with `--mirror` and pushes it to the `origin` remote of this GitHub repository.

5. If the script succeeds, confirm to the user that the mirror is complete. If it fails, show the error and suggest checking the PAT scopes or network access.

Note: This is a **destructive mirror** — it replaces all branches, tags, and refs in the GitHub repo with the GitLab content.
