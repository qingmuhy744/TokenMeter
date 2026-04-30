from sqlalchemy import create_engine

try:
    engine = create_engine("postgresql+psycopg://user:pass@localhost/db")
    print(f"Dialect name: {engine.dialect.name}")
    print(f"Driver: {engine.dialect.driver}")
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
