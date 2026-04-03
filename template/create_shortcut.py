"""
创建桌面快捷方式 (Create Desktop Shortcut)
运行一次即可在桌面生成「我的回忆录」快捷方式。
"""
import os, sys

HERE     = os.path.dirname(os.path.abspath(__file__))
PYW_FILE = os.path.join(HERE, "open_memoirs.pyw")
ICO_FILE = os.path.join(HERE, "memoirs", "webapp", "dist", "icon.ico")
DESKTOP  = os.path.join(os.path.expanduser("~"), "Desktop")
LNK_PATH = os.path.join(DESKTOP, "我的回忆录.lnk")

try:
    import pythoncom
    from win32com.client import Dispatch
    shell = Dispatch("WScript.Shell")
    shortcut = shell.CreateShortCut(LNK_PATH)
    shortcut.Targetpath   = sys.executable.replace("python.exe", "pythonw.exe")
    shortcut.Arguments    = f'"{PYW_FILE}"'
    shortcut.WorkingDirectory = HERE
    shortcut.IconLocation = f'{ICO_FILE},0' if os.path.exists(ICO_FILE) else ""
    shortcut.Description  = "打开我的回忆录阅读器"
    shortcut.save()
    print(f"✅ 快捷方式已创建：{LNK_PATH}")
except ImportError:
    # pywin32 not installed — fallback: create a .bat launcher on Desktop
    bat_path = os.path.join(DESKTOP, "我的回忆录.bat")
    with open(bat_path, "w", encoding="utf-8") as f:
        pythonw = sys.executable.replace("python.exe", "pythonw.exe")
        f.write(f'@echo off\nstart "" "{pythonw}" "{PYW_FILE}"\n')
    print(f"✅ 启动器已创建：{bat_path}")
    print("   （双击即可打开，如需图标请 pip install pywin32 后重新运行）")
