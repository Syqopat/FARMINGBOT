import os
import re

def remove_comments(content, ext):
    if ext in ['.js', '.css']:
        # Remove /* ... */
        content = re.sub(r'/\*[\s\S]*?\*/', '', content)
        # Remove // ...
        content = re.sub(r'(?<!:)\/\/.*', '', content)
    elif ext == '.html':
        content = re.sub(r'<!--[\s\S]*?-->', '', content)
    elif ext == '.py':
        # Remove # ...
        content = re.sub(r'(?m)^\s*#.*$', '', content)
        content = re.sub(r'(?m)  #.*$', '', content)
    return content

def rename_terms(content):
    content = content.replace("CactusFarm Bot", "Suki Farm Bot")
    content = content.replace("Cactus Farm Bot", "Suki Farm Bot")
    content = content.replace("CactusFarm", "SukiFarmBot")
    content = content.replace("Cactus Farm", "Suki Farm Bot")
    content = content.replace("Kaktüs Farm", "Suki Farm Bot")
    content = content.replace("cactusfarm-bot", "suki-farm-bot")
    content = content.replace("cactusfarm", "sukifarmbot")
    content = content.replace("cactus-farm", "suki-farm-bot")
    return content

def process_file(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext not in ['.js', '.html', '.css', '.py', '.json']:
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = rename_terms(content)
    new_content = remove_comments(new_content, ext)

    # Clean up multiple empty lines
    new_content = re.sub(r'\n\s*\n', '\n', new_content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

def main():
    root_dir = r"c:\Users\kuzey\Desktop\MY PROJECTS\SOFTWARE\ANTIGRAVITY\FARMINGBOT"
    skip_dirs = ['node_modules', 'sukibotclient', '.git']
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            if f == 'modify.py':
                continue
            filepath = os.path.join(dirpath, f)
            try:
                process_file(filepath)
            except Exception as e:
                print(f"Error processing {filepath}: {e}")

if __name__ == '__main__':
    main()
