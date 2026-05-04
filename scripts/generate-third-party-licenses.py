#!/usr/bin/env python3
"""
THIRD_PARTY_LICENSES.md 생성 스크립트
- Rust: cargo metadata 로 모든 crate 정보 수집 + ~/.cargo/registry/src/ 에서 LICENSE 파일 직접 읽음
- JS: pnpm dlx license-checker-rseidelsohn 의 JSON 출력에서 licenseFile 경로 가져옴
- 산출: 프로젝트 루트 THIRD_PARTY_LICENSES.md + src/data/THIRD_PARTY_LICENSES.md (앱 번들 포함용)

이 스크립트는 일회성 빌드 도구이며, 의존성이 추가/제거될 때 재실행한다.
"""

import json
import os
import subprocess
import sys
import re
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
SRC_TAURI = PROJECT_ROOT / "src-tauri"
OUT_ROOT = PROJECT_ROOT / "THIRD_PARTY_LICENSES.md"
OUT_BUNDLED = PROJECT_ROOT / "src" / "data" / "THIRD_PARTY_LICENSES.md"

LICENSE_FILE_NAMES = [
    "LICENSE", "LICENSE.md", "LICENSE.txt",
    "LICENSE-MIT", "LICENSE-MIT.md", "LICENSE-MIT.txt",
    "LICENSE-APACHE", "LICENSE-APACHE.md", "LICENSE-APACHE.txt",
    "LICENSE-BSD", "LICENSE-BSD.md", "LICENSE-BSD.txt",
    "LICENSE-MPL", "LICENSE-MPL.md", "LICENSE-MPL.txt",
    "License", "License.md", "License.txt",
    "license", "license.md", "license.txt",
    "COPYING", "COPYING.md", "COPYING.txt",
    "UNLICENSE",
]


def find_license_text(directory: Path) -> str | None:
    """디렉토리에서 첫 번째 LICENSE 파일을 찾아 본문 반환"""
    if not directory.is_dir():
        return None
    for name in LICENSE_FILE_NAMES:
        p = directory / name
        if p.is_file():
            try:
                return p.read_text(encoding="utf-8", errors="replace").strip()
            except Exception:
                pass
    # fallback: glob LICENSE*
    for p in directory.glob("LICENSE*"):
        if p.is_file():
            try:
                return p.read_text(encoding="utf-8", errors="replace").strip()
            except Exception:
                pass
    for p in directory.glob("[Ll]icense*"):
        if p.is_file():
            try:
                return p.read_text(encoding="utf-8", errors="replace").strip()
            except Exception:
                pass
    return None


def collect_rust():
    """cargo metadata 로 Rust 의존성 수집"""
    print("→ Rust: cargo metadata 실행 중...", file=sys.stderr)
    result = subprocess.run(
        ["cargo", "metadata", "--format-version", "1"],
        cwd=SRC_TAURI,
        check=True,
        capture_output=True,
        text=True,
    )
    metadata = json.loads(result.stdout)
    pkgs = []
    for pkg in metadata["packages"]:
        name = pkg["name"]
        version = pkg["version"]
        # 자기 자신 제외
        if name == "loglens":
            continue
        license_str = pkg.get("license") or "UNKNOWN"
        manifest_path = Path(pkg["manifest_path"])
        crate_dir = manifest_path.parent
        license_text = find_license_text(crate_dir)
        # license_file 필드가 명시된 경우
        if not license_text and pkg.get("license_file"):
            lf = crate_dir / pkg["license_file"]
            if lf.is_file():
                try:
                    license_text = lf.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    pass
        repository = pkg.get("repository") or ""
        crates_io_url = f"https://crates.io/crates/{name}/{version}"
        pkgs.append({
            "name": name,
            "version": version,
            "license": license_str,
            "license_text": license_text,
            "repository": repository,
            "url": crates_io_url,
            "ecosystem": "rust",
        })
    print(f"  {len(pkgs)} crates", file=sys.stderr)
    return pkgs


def collect_js():
    """license-checker-rseidelsohn 으로 JS 의존성 수집 (production only)"""
    print("→ JS: license-checker 실행 중 (production)...", file=sys.stderr)
    result = subprocess.run(
        ["pnpm", "dlx", "--silent", "license-checker-rseidelsohn",
         "--production", "--json", "--start", str(PROJECT_ROOT)],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    pkgs = []
    for key, info in data.items():
        # key 는 "name@version" 형태
        m = re.match(r"^(.+)@([^@]+)$", key)
        if not m:
            continue
        name, version = m.group(1), m.group(2)
        # 자기 자신 제외
        if name == "loglens":
            continue
        license_str = info.get("licenses") or "UNKNOWN"
        if isinstance(license_str, list):
            license_str = " OR ".join(license_str)
        license_text = None
        lic_file = info.get("licenseFile")
        if lic_file and Path(lic_file).is_file():
            # README 같은 fallback 은 무시 (license-checker 가 README 를 fallback 으로 잡는 경우 있음)
            base = Path(lic_file).name.lower()
            if not base.startswith("readme"):
                try:
                    license_text = Path(lic_file).read_text(
                        encoding="utf-8", errors="replace"
                    ).strip()
                except Exception:
                    pass
        repository = info.get("repository") or ""
        npm_url = f"https://www.npmjs.com/package/{name}/v/{version}"
        pkgs.append({
            "name": name,
            "version": version,
            "license": license_str,
            "license_text": license_text,
            "repository": repository,
            "url": npm_url,
            "ecosystem": "js",
        })
    print(f"  {len(pkgs)} packages", file=sys.stderr)
    return pkgs


def categorize_license(lic: str) -> str:
    """라이선스 분류 (요약용 카테고리)"""
    upper = lic.upper()
    if "AGPL" in upper:
        return "AGPL"
    if "GPL" in upper and "OR" not in upper and "LGPL" not in upper:
        return "GPL"
    if "LGPL" in upper:
        return "LGPL"
    if "MPL" in upper:
        return "MPL-2.0"
    if "APACHE" in upper:
        return "Apache-2.0"
    if "BSD" in upper:
        return "BSD"
    if "ISC" in upper:
        return "ISC"
    if "MIT" in upper:
        return "MIT"
    if "CC0" in upper or "CC-0" in upper:
        return "CC0"
    if "CC-BY" in upper:
        return "CC-BY"
    if "ZLIB" in upper:
        return "Zlib"
    if "BLUEOAK" in upper:
        return "BlueOak-1.0.0"
    if "UNLICENSE" in upper:
        return "Unlicense"
    return "Other"


# 표준 라이선스 본문 (앱 자체 정책 명시용 — jszip / r-efi 듀얼 라이선스에서 MIT 선택 명시)
MIT_LICENSE_BODY = """MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""


def build_markdown(rust_pkgs, js_pkgs) -> str:
    all_pkgs = rust_pkgs + js_pkgs
    # 카테고리별 카운트
    counts = defaultdict(int)
    for p in all_pkgs:
        counts[categorize_license(p["license"])] += 1

    lines = []
    lines.append("# Third Party Licenses")
    lines.append("")
    lines.append("LogLens 는 다음과 같은 오픈소스 소프트웨어를 사용합니다.")
    lines.append("이 문서는 사용된 모든 의존성과 그 라이선스를 명시합니다.")
    lines.append("")
    lines.append(f"- **총 패키지**: {len(all_pkgs)} 개")
    lines.append(f"  - Rust crates: {len(rust_pkgs)}")
    lines.append(f"  - npm packages: {len(js_pkgs)} (production)")
    lines.append("")
    lines.append("## 라이선스 분포")
    lines.append("")
    lines.append("| 라이선스 | 패키지 수 |")
    lines.append("|---------|---------|")
    for cat, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {cat} | {n} |")
    lines.append("")
    lines.append("## 듀얼 라이선스 채택 명시")
    lines.append("")
    lines.append("LogLens 는 다음 듀얼 라이선스 패키지에서 **MIT 라이선스를 선택** 합니다.")
    lines.append("이는 GPL/LGPL 의무를 회피하기 위함입니다.")
    lines.append("")
    lines.append("- **jszip** (`MIT OR GPL-3.0-or-later`) → MIT 선택")
    lines.append("- **r-efi** (`MIT OR Apache-2.0 OR LGPL-2.1-or-later`) → MIT 선택")
    lines.append("")
    lines.append("적용 라이선스 본문:")
    lines.append("")
    lines.append("```")
    lines.append(MIT_LICENSE_BODY)
    lines.append("```")
    lines.append("")
    lines.append("## MPL-2.0 패키지 안내")
    lines.append("")
    lines.append("MPL-2.0 (Mozilla Public License 2.0) 라이선스로 배포되는 다음 패키지가 포함되어 있습니다.")
    lines.append("MPL-2.0 은 *파일 단위 weak copyleft* 라이선스이며, 단순 사용·링크·배포에는 추가 의무가 없습니다.")
    lines.append("LogLens 는 이 패키지들을 수정하지 않은 채 그대로 사용합니다.")
    lines.append("")
    mpl_pkgs = [p for p in all_pkgs if categorize_license(p["license"]) == "MPL-2.0"]
    for p in mpl_pkgs:
        lines.append(f"- `{p['name']}` {p['version']} ({p['ecosystem']}) — {p['url']}")
    lines.append("")

    # 본문: 패키지별 라이선스
    lines.append("---")
    lines.append("")
    lines.append("## Rust Crates")
    lines.append("")
    for p in sorted(rust_pkgs, key=lambda x: x["name"].lower()):
        lines.append(f"### {p['name']} {p['version']}")
        lines.append("")
        lines.append(f"- License: `{p['license']}`")
        if p["repository"]:
            lines.append(f"- Repository: {p['repository']}")
        lines.append(f"- crates.io: {p['url']}")
        lines.append("")
        if p["license_text"]:
            lines.append("```")
            lines.append(p["license_text"])
            lines.append("```")
        else:
            lines.append("> (라이선스 본문 자동 수집 실패. crates.io 페이지 또는 repository 참조)")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## npm Packages (production)")
    lines.append("")
    for p in sorted(js_pkgs, key=lambda x: x["name"].lower()):
        lines.append(f"### {p['name']} {p['version']}")
        lines.append("")
        lines.append(f"- License: `{p['license']}`")
        if p["repository"]:
            lines.append(f"- Repository: {p['repository']}")
        lines.append(f"- npm: {p['url']}")
        lines.append("")
        if p["license_text"]:
            lines.append("```")
            lines.append(p["license_text"])
            lines.append("```")
        else:
            lines.append("> (라이선스 본문 자동 수집 실패. npm 또는 repository 참조)")
        lines.append("")

    return "\n".join(lines) + "\n"


def main():
    rust_pkgs = collect_rust()
    js_pkgs = collect_js()
    md = build_markdown(rust_pkgs, js_pkgs)
    OUT_ROOT.write_text(md, encoding="utf-8")
    OUT_BUNDLED.parent.mkdir(parents=True, exist_ok=True)
    OUT_BUNDLED.write_text(md, encoding="utf-8")
    print(f"✓ {OUT_ROOT.relative_to(PROJECT_ROOT)} ({len(md):,} bytes)", file=sys.stderr)
    print(f"✓ {OUT_BUNDLED.relative_to(PROJECT_ROOT)} ({len(md):,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
