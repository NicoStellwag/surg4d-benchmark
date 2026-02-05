# Python tooling
- Add python packages using `pixi add --pypi ...`
- Run python commands with `pixi run python ...`
- Add other tooling via pixi conda using `pixi add ...`

# Code style
- If accessing config values assume they exist, never use fallback values, just let the code fail if not existant
- No defensive coding (try catches etc.)
- Imports only at top the file
- Use pathlib not os