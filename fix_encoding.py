import os
import codecs

def add_bom_to_file(file_path):
    try:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        if content.startswith(codecs.BOM_UTF8):
            print(f"BOM already exists: {file_path}")
            return

        with open(file_path, 'w', encoding='utf-8-sig') as f:
            f.write(content.decode('utf-8'))
        print(f"Added BOM to: {file_path}")
    except Exception as e:
        print(f"Error processing {file_path}: {e}")

def main():
    # Scan for all .ps1 and .json files in current and subdirectories
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith((".ps1", ".json", ".txt")):
                file_path = os.path.join(root, file)
                add_bom_to_file(file_path)

if __name__ == "__main__":
    main()
