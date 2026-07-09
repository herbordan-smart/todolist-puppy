#!/usr/bin/env python3
"""自动找到云盘挂载点，把小狗图片复制到 assets 目录"""
import os, shutil, glob

assets = os.path.expanduser("~/goose-todo/assets")
os.makedirs(assets, exist_ok=True)

# 要复制的文件映射
files = {
    "dog-working-sm.png": "dog-working.png",
    "dog-sleeping-sm.png": "dog-sleeping.png",
    "dog-ready-sm.png": "dog-ready.png",
}

# 搜索所有可能的挂载点
search_paths = []
for vol in glob.glob("/Volumes/*"):
    search_paths.append(os.path.join(vol, "goose-todo", "assets"))
    search_paths.append(os.path.join(vol, "workspace", "goose-todo", "assets"))

# 也搜索常见的 SMB 挂载点
for home_vol in glob.glob(os.path.expanduser("~/Library/CloudStorage/*")):
    search_paths.append(os.path.join(home_vol, "goose-todo", "assets"))

print("Searching in:", search_paths)

found_any = False
for src_dir in search_paths:
    if not os.path.isdir(src_dir):
        continue
    for src_name, dst_name in files.items():
        src = os.path.join(src_dir, src_name)
        dst = os.path.join(assets, dst_name)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"✅ Copied: {src} -> {dst} ({os.path.getsize(dst)} bytes)")
            found_any = True

if not found_any:
    print("❌ No source files found. Available volumes:")
    for v in glob.glob("/Volumes/*"):
        print(f"  {v}")
    print("\nPlease run manually:")
    print("  cp /Volumes/<your-mount>/goose-todo/assets/dog-*-sm.png ~/goose-todo/assets/")
else:
    print("\n🐶 All done! Restart the app:")
    print("  pkill -f electron; sleep 1; cd ~/goose-todo && npm start")
