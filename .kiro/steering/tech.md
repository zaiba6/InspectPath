# Tech rules

- Follow docs/contract.md exactly. Never change a shared contract without telling the team.
- Frontend: React + Vite in web/. ML: Python, PyTorch, FastAPI.
- Prefer the simplest working solution. Do not add features outside the spec.
- Never show mock or sample data to users. If a data file can't be loaded, say which file and why, and show nothing in its place. Sample files are test fixtures only, in web/src/test/fixtures/.
- Never hardcode API keys or secrets. Use .env and keep .env out of git. Commit only .env.example.
- Never commit datasets, dataset images, or files over 50 MB.
- UI text must be plain language for non-specialists.
- The UI must work on a laptop screen and stay readable on a phone.
- Include the disclaimer: "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings."
