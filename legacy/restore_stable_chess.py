#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import subprocess
import shutil
import sys

REQUIRED_MARKERS = {
    "棋盘换色": ["themeBtn", "切换棋盘"],
    "人机模式": ["difficulty", "电脑难度"],
    "自动保存": ["localStorage", "saveGame"],
    "悔棋": ["undo", "悔棋"],
    "翻转棋盘": ["flip", "翻转棋盘"],
    "双向棋子": ["face-black", "rotate(180deg)"],
    "走棋逻辑": ["makeMove", "legalMoves"],
}

def run(*args, check=True):
    result = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode != 0:
        print(result.stderr.strip())
        sys.exit(result.returncode)
    return result.stdout

repo_root = Path(run("git", "rev-parse", "--show-toplevel").strip())
target_dir = repo_root / "chess"
target_file = target_dir / "index.html"

if not target_dir.exists():
    print(f"找不到目录：{target_dir}")
    sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_dir = repo_root / "backups" / f"chess_before_restore_{stamp}"
backup_dir.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(target_dir, backup_dir)
print(f"已备份当前 Chess：{backup_dir}")

commits = run(
    "git", "log", "--format=%H", "--all", "--", "chess/index.html"
).splitlines()

if not commits:
    print("Git 历史中找不到 chess/index.html。")
    sys.exit(1)

best = None

for order, commit in enumerate(commits):
    result = subprocess.run(
        ["git", "show", f"{commit}:chess/index.html"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        continue

    content = result.stdout
    matched = {}

    for feature, markers in REQUIRED_MARKERS.items():
        matched[feature] = any(marker in content for marker in markers)

    score = sum(matched.values())

    # 优先最新，其次功能分数。找到功能足够完整的最新版本就停止。
    candidate = {
        "commit": commit,
        "content": content,
        "matched": matched,
        "score": score,
        "order": order,
    }

    if best is None or score > best["score"]:
        best = candidate

    if score >= 6:
        best = candidate
        break

if not best or best["score"] < 4:
    print("没有找到足够完整的历史版本，为避免覆盖，脚本已停止。")
    if best:
        print(f"最高匹配分数：{best['score']}/7，提交：{best['commit'][:10]}")
    sys.exit(1)

target_dir.mkdir(parents=True, exist_ok=True)
target_file.write_text(best["content"], encoding="utf-8")

print()
print("恢复完成。")
print(f"来源提交：{best['commit']}")
print(f"已恢复文件：{target_file}")
print("功能识别：")
for feature, ok in best["matched"].items():
    print(f"  {'✓' if ok else '△'} {feature}")

note = repo_root / "CHESS_STABLE_SOURCE.txt"
note.write_text(
    "Nocturne Chess stable source\n"
    f"Restored from commit: {best['commit']}\n"
    f"Restored at: {stamp}\n"
    f"Backup: {backup_dir.relative_to(repo_root)}\n",
    encoding="utf-8",
)

print()
print("请启动本地服务器测试：")
print("  python -m http.server 8080")
print("  http://localhost:8080/chess/?restore=1")
print()
print("测试通过后执行：")
print('  git add chess/index.html CHESS_STABLE_SOURCE.txt backups/')
print('  git commit -m "fix(chess): restore stable full-featured version"')
print('  git tag -a chess-stable-v1.0 -m "Stable Nocturne Chess baseline"')
print('  git branch dev')
print('  git push origin main --tags')
print('  git push -u origin dev')
