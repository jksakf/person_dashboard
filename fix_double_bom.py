import os

file_path = r"c:\Users\User\OneDrive\桌面\person\自己\金融\person_dashboard\modules\Transaction.ps1"

if os.path.exists(file_path):
    with open(file_path, "rb") as f:
        content = f.read()
    
    # Strip any number of BOMs from the start
    bom = b'\xef\xbb\xbf'
    while content.startswith(bom):
        content = content[3:]
    
    # Write back with exactly one BOM
    with open(file_path, "wb") as f:
        f.write(bom + content)
        
    print(f"Fixed Double BOM for: {file_path}")
