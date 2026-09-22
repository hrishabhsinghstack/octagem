# OctaGem Git Commit & Publication Documentation

This document outlines the standard Git commit conventions, release notes format, and deployment instructions for publishing the **OctaGem** web application to [https://github.com/hrishabhsinghstack/octagem.git](https://github.com/hrishabhsinghstack/octagem.git).

---

## 📋 Git Commit Standard (Conventional Commits)

OctaGem adheres to the **Conventional Commits** specification (`v1.0.0`). Every commit message must follow this structure:

```
<type>(<scope>): <short summary>

[optional body describing the motivation, changes, and context]

[optional footer(s)]
```

### Commit Types
- `feat`: A new feature or major capability
- `fix`: A bug fix
- `docs`: Documentation updates only (`README.md`, `GIT_COMMIT.md`)
- `style`: Changes that do not affect code logic (white-space, formatting, missing semi-colons)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `chore`: Build process, dependency updates, configuration changes

---

## 🚀 Initial Release Commit Specification

Below is the complete commit message specification for publishing the initial release of **OctaGem**.

### Proposed Commit Title
```text
feat(web): initial release of OctaGem Diamond, Jewelry & Watch ERP platform
```

### Proposed Commit Body
```text
- Rebrand platform across codebase from OctaCore to OctaGem
- Integrate official brand logos (octagem.png horizontal logo & octagemmark.png brand mark)
- Update web package manifest, HTML meta title, site config, and favicons
- Migrate client-side LocalStorage keys to octagem.* namespace
- Add comprehensive production README.md and GIT_COMMIT.md documentation
- Configure clean build setup targeting https://github.com/hrishabhsinghstack/octagem.git
```

---

## 🛠️ Step-by-Step Git Commands for Publishing

Execute the following commands from the root directory of the web application (`D:\In-house\octatag\OctaCore\web`):

### 1. Initialize Git Repository
```bash
git init -b main
```

### 2. Verify Ignored & Tracked Files
```bash
git status
```
*Ensure `node_modules/`, `dist/`, `.env`, and OS files are ignored.*

### 3. Stage All Prepared Files
```bash
git add .
```

### 4. Commit Changes
```bash
git commit -m "feat(web): initial release of OctaGem Diamond, Jewelry & Watch ERP platform" -m "- Rebrand platform across codebase from OctaCore to OctaGem
- Integrate official brand logos (octagem.png horizontal logo & octagemmark.png brand mark)
- Update web package manifest, HTML meta title, site config, and favicons
- Migrate client-side LocalStorage keys to octagem.* namespace
- Add comprehensive production README.md and GIT_COMMIT.md documentation
- Configure clean build setup targeting https://github.com/hrishabhsinghstack/octagem.git"
```

### 5. Configure Remote Origin & Push to GitHub
```bash
git remote add origin https://github.com/hrishabhsinghstack/octagem.git
git branch -M main
git push -u origin main
```

---

## 🔒 Security & Quality Audit Checklist Before Push

- [x] No sensitive API keys, secrets, or passwords hardcoded.
- [x] `node_modules` successfully excluded via `.gitignore`.
- [x] TypeScript compilation passes cleanly (`npm run build`).
- [x] Brand logos (`octagem.png` and `octagemmark.png`) verified in `public/`.
- [x] Remote URL verified: `https://github.com/hrishabhsinghstack/octagem.git`.
