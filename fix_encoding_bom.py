import os

files_to_fix = [
    r"c:\Users\User\OneDrive\桌面\person\自己\金融\person_dashboard\modules\Transaction.ps1",
    r"c:\Users\User\OneDrive\桌面\person\自己\金融\person_dashboard\modules\CostCalculator.ps1"
]

for file_path in files_to_fix:
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            with open(file_path, "w", encoding="utf-8-sig") as f:
                f.write(content)
            print(f"Fixed encoding for: {file_path}")
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")
    else:
        print(f"File not found: {file_path}")
