import os

files = [
    r"modules\BankAsset.ps1",
    r"modules\StockHolding.ps1",
    r"modules\RealizedPnL.ps1",
    r"modules\Transaction.ps1",
    r"modules\CostCalculator.ps1",
    r"AssetManager.ps1",
    r"common.ps1"
]

root = r"c:\Users\User\OneDrive\桌面\person\自己\金融\person_dashboard"

for f in files:
    path = os.path.join(root, f)
    if os.path.exists(path):
        with open(path, "rb") as fin:
            header = fin.read(10)
            print(f"{f}: {header.hex()}")
    else:
        print(f"{f}: Not Found")
