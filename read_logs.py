
with open("app_logs.txt", "r", encoding="utf-16le") as f:
    for line in f:
        if "Erro" in line or "sqlalchemy" in line.lower():
            print(line.strip())
