# Add this folder to the existing repository

This is an additive sibling folder. Extract it at the root of your existing `Mad-Eye-Moody-Lens` repository:

```text
Mad-Eye-Moody-Lens/
├── detection-studio/          # Existing local application: do not replace
└── detection-studio-cloud/    # New cloud/Colab integration
```

In PowerShell from the repository root:

```powershell
git status --short
# Confirm only detection-studio-cloud/ is new/modified before staging.
git add detection-studio-cloud
git diff --cached --stat
git status --short
```

Check there are no `.pt`, `.pth`, `.env`, `.env.local`, `node_modules`, `.venv`, or `third_party/IAPL` files staged. Then:

```powershell
git commit -m "Add separate Colab cloud workflow for Detection Studio"
git push origin ruturaj-dev
```

Do not use `git add .` if you have unrelated uncommitted work. Do not remove or replace the repository's `.git` directory.
