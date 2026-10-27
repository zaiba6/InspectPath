# Demo run checklist (Windows laptop)

Run the whole system from a fresh pull of `main`. Commands are PowerShell, run
from the repo root unless noted. Dataset images are **not** in git, so step 1 is
required for real defect findings.

## 1. Put the CODEBRIM demo images in place

The dashboard serves images from `data/images/` (gitignored; never committed).
Copy the demo crops so the paths in `data/image_map.json` resolve:

```
data/images/test/background/...   <- full capture crops
data/images/test/defects/...      <- defect + close-up crops
```

Each path in `data/image_map.json` is `images/test/<...>.png`, loaded by the UI
as `/data/images/test/<...>.png`. If the folder is missing, each imaged
connection shows "Not scored: image not available", with no tier and no scores.

## 2. Start the defect API on port 8001

No `ml/defect/requirements.txt` exists yet, so install deps explicitly.

```powershell
cd ml\defect
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]" pillow torch torchvision numpy python-multipart
# Real model (uses artifacts\best.pt):
uvicorn api.main:app --port 8001
# Test mode, for API testing only (deterministic fake scores, no torch needed).
# The dashboard never shows these: findings read "Not scored: the defect model
# is running in test mode".
#   $env:MOCK_MODEL="1"; uvicorn api.main:app --port 8001
```

Leave this running in its own terminal. CORS allows `http://localhost:5173` by
default. Check it: open <http://localhost:8001/health> → `{"status":"ok",...}`.

## 3. (Optional) Start the report API on port 8000

Enables the "AI summary" button. The dashboard works without it (rule-based
report is the default).

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # then set GEMINI_API_KEY in .env
uvicorn main:app --port 8000
```

## 4. Start the dashboard

```powershell
cd web
npm install
npm run dev     # predev copies data\ into web\public\data\ automatically
```

Open the printed URL (default <http://localhost:5173/>).

## 5. Confirm each piece is loaded

The dashboard never shows mock or sample data. If a file can't be loaded, the
view says so and names the file instead of showing anything in its place.

| Piece | Needs | Loaded | Not loaded |
|---|---|---|---|
| Replay | `data/trigger/replay_kw51_demo.json` (KW51 demo) or `replay_kw51.json` (KW51 full), chosen in the **Dataset** dropdown | Monitor subtitle reads "Replay of real bridge data (KW51 replay, <first date> to <last date> UTC)". | "Bridge monitoring data couldn't be loaded", with the file and the reason. No readings. |
| Structure and plans | `data/structures/kw51_layout.json`, `data/plans/kw51_naive.json`, `data/plans/kw51_optimized.json` | The KW51 side elevation with the route. | "Bridge inspection data couldn't be loaded", with the file and the reason. No map, route, or findings. |
| Defects | Defect API on 8001 (not in test mode) **and** images in `data/images/` | Imaged connections show a tier and scores. | Each one shows why it wasn't scored: the model isn't running, the model is in test mode, or the image isn't available. No tier, no scores, no map pin. |

The retrofit context note on the status card appears only while the current
reading is inside KW51's retrofit period (2019-05-15 to 2019-09-27).

Other data problems (for example an image-map key that is not a connection in
the layout) show a yellow **Data warning** banner above the views, naming the
file or field.
