"""
Step 1 of prototyping: just look at the data.
Run with: venv\\Scripts\\python.exe explore.py
"""

import pandas as pd

CSV_PATH = "data/FPL Assistant Data - Players_Raw.csv"

# Show more columns/rows than pandas' default when we print things
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

df = pd.read_csv(CSV_PATH)

print("=== Shape (rows, columns) ===")
print(df.shape)

print("\n=== Column names ===")
for col in df.columns:
    print(col)

print("\n=== Data types ===")
print(df.dtypes)

print("\n=== First 5 rows ===")
print(df.head())
