#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""임상연구 페이지와 ClinicalTrials.gov 등록부를 대조한다.

판단은 하지 않는다. 문자열 비교만 한다.
사람이 봐야 할 게 있을 때만 보고서를 남기고, 없으면 조용히 끝난다.

설계상 지켜야 할 것 하나 — 조회가 실패하면 "이상 없음"이라고 하지 않는다.
그건 가장 나쁜 실패 방식이다. 실패는 실패로 보고하고 종료코드 2를 낸다.

사용:
    python tools/check_trials.py            # 보고서를 stdout 으로
    python tools/check_trials.py -o out.md  # 파일로도
종료코드:
    0 = 확인할 것 없음   1 = 확인할 것 있음   2 = 점검 자체가 실패
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# 러너는 UTC 로 돈다. 사이트 날짜는 한국 기준이므로 맞춰준다.
KST = timezone(timedelta(hours=9))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    ROOT / "src" / "pages" / "clinical-trials.md",
    ROOT / "src" / "pages" / "en" / "clinical-trials.md",
]
API = "https://clinicaltrials.gov/api/v2/studies"
CONDITION = "adrenoleukodystrophy"

# 검토일이 이보다 오래되면 알린다. 사이트가 방치돼 보이기 시작하는 시점.
STALE_DAYS = 180

STATUS_RE = re.compile(r"`([A-Z_]{4,})`")
NCT_RE = re.compile(r"NCT\d{8}")
# 모집 중인데 우리 페이지에 없으면 새로 생긴 시험일 수 있다.
OPEN_STATUSES = {"RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"}


class CheckFailed(Exception):
    """점검을 수행할 수 없었다. '이상 없음'과 절대 섞지 않는다."""


def fetch_registry():
    """등록부 전체를 {NCT: {...}} 로 가져온다. 실패하면 예외."""
    out, token = {}, None
    for _ in range(20):  # 페이지 루프 상한
        params = {
            "query.cond": CONDITION,
            "pageSize": "200",
            "fields": "NCTId,BriefTitle,OverallStatus,LastUpdatePostDate,LeadSponsorName,StudyType",
        }
        if token:
            params["pageToken"] = token
        url = f"{API}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "kalds.org-monitor"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status != 200:
                    raise CheckFailed(f"등록부 응답 코드 {r.status}")
                data = json.loads(r.read().decode("utf-8"))
        except CheckFailed:
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            raise CheckFailed(f"등록부 조회 실패: {type(e).__name__}: {e}") from e

        for s in data.get("studies", []):
            p = s["protocolSection"]
            idm, sm = p["identificationModule"], p["statusModule"]
            out[idm["nctId"]] = {
                "status": sm.get("overallStatus", ""),
                "updated": sm.get("lastUpdatePostDateStruct", {}).get("date", ""),
                "title": idm.get("briefTitle", ""),
                "sponsor": p.get("sponsorCollaboratorsModule", {})
                            .get("leadSponsor", {}).get("name", ""),
                "type": p.get("designModule", {}).get("studyType", ""),
            }
        token = data.get("nextPageToken")
        if not token:
            break

    if len(out) < 20:
        # 74건 나오던 조회다. 이보다 훨씬 적으면 조회가 깨진 것으로 본다.
        raise CheckFailed(f"등록부에서 {len(out)}건만 조회됨 — 조회가 깨진 것으로 보고 중단")
    return out


def page_statuses(text):
    """페이지에 적힌 {NCT: 상태}.

    표 서식은 상태가 링크 뒤에, 산문 서식은 앞에 온다. 둘 다 본다.
    """
    found = {}
    for nct in dict.fromkeys(NCT_RE.findall(text)):
        i = text.find(nct)
        shown = None
        after = STATUS_RE.search(text[i:i + 400])
        # 뒤쪽 상태가 다음 항목 영역에서 온 것이면 쓰지 않는다
        if after and "NCT" not in text[i + 11:i + 11 + after.start()]:
            shown = after.group(1)
        if shown is None:
            seg = text[max(0, i - 700):i]
            head = seg.rfind("###")
            before = STATUS_RE.findall(seg[head if head >= 0 else 0:])
            if before:
                shown = before[-1]
        found[nct] = shown
    return found


def review_dates(pages_dir):
    """모든 md 의 최종 검토일 중 가장 최근 것."""
    ko = re.compile(r"최종 검토일[:：]?\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일")
    months = ["january", "february", "march", "april", "may", "june",
              "july", "august", "september", "october", "november", "december"]
    en = re.compile(r"Last reviewed[:：]?\s*(\d{1,2})\s+(" + "|".join(months) + r")\s+(\d{4})", re.I)
    best = None
    for p in pages_dir.rglob("*.md"):
        t = p.read_text(encoding="utf-8")
        for m in ko.finditer(t):
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            best = d if not best or d > best else best
        for m in en.finditer(t):
            d = date(int(m.group(3)), months.index(m.group(2).lower()) + 1, int(m.group(1)))
            best = d if not best or d > best else best
    return best


def main():
    today = datetime.now(KST).date()
    lines = [f"# ALD 사이트 자동 점검 · {today.isoformat()}", ""]
    findings = 0

    try:
        reg = fetch_registry()
    except CheckFailed as e:
        print(f"# 점검 실패 · {today.isoformat()}\n\n**{e}**\n\n"
              "등록부를 확인하지 못했으므로 **이상 없음이 아니라 판정 불가**입니다.\n"
              "ClinicalTrials.gov API 사양이 바뀌었을 수 있습니다.")
        return 2

    lines.append(f"등록부에서 ALD 관련 **{len(reg)}건**을 조회했습니다.\n")

    # 1) 페이지 표기 vs 등록부
    listed = set()
    mismatch, unknown = [], []
    for page in PAGES:
        if not page.exists():
            unknown.append(f"{page.relative_to(ROOT)} 파일이 없습니다")
            continue
        rel = page.relative_to(ROOT).as_posix()
        for nct, shown in page_statuses(page.read_text(encoding="utf-8")).items():
            listed.add(nct)
            cur = reg.get(nct)
            if cur is None:
                unknown.append(f"`{nct}` — 페이지에 있으나 등록부 조회 결과에 없음 ({rel})")
            elif shown is None:
                unknown.append(f"`{nct}` — 페이지에서 상태 표기를 찾지 못함 ({rel})")
            elif shown != cur["status"]:
                mismatch.append((nct, rel, shown, cur))

    if mismatch:
        findings += len(mismatch)
        lines += ["## 상태가 달라진 시험", "",
                  "| NCT | 페이지 표기 | 등록부 현재 | 등록부 갱신일 | 파일 |",
                  "|---|---|---|---|---|"]
        for nct, rel, shown, cur in sorted(mismatch):
            lines.append(f"| [{nct}](https://clinicaltrials.gov/study/{nct}) "
                         f"| `{shown}` | `{cur['status']}` | {cur['updated']} | {rel} |")
        lines.append("")

    # 2) 모집 중인데 페이지에 없는 시험
    missing = [(n, v) for n, v in reg.items()
               if v["status"] in OPEN_STATUSES and n not in listed]
    if missing:
        findings += len(missing)
        lines += ["## 페이지에 없는 모집 중 시험", "",
                  "새로 생긴 시험일 수 있습니다. 사람이 보고 실을지 판단해야 합니다.", "",
                  "| NCT | 상태 | 유형 | 의뢰자 | 제목 |", "|---|---|---|---|---|"]
        for nct, v in sorted(missing, key=lambda x: x[1]["updated"], reverse=True):
            title = v["title"].replace("|", "／")[:70]
            lines.append(f"| [{nct}](https://clinicaltrials.gov/study/{nct}) | `{v['status']}` "
                         f"| {v['type']} | {v['sponsor'][:28]} | {title} |")
        lines.append("")

    # 3) 검토일이 오래되었는지
    newest = review_dates(ROOT / "src" / "pages")
    if newest:
        age = (today - newest).days
        if age > STALE_DAYS:
            findings += 1
            lines += ["## 검토일이 오래되었습니다", "",
                      f"가장 최근 검토일이 **{newest.isoformat()}** 로 **{age}일** 지났습니다. "
                      f"(기준 {STALE_DAYS}일)", "",
                      "첫 화면에 이 날짜가 그대로 보입니다.", ""]
    else:
        unknown.append("검토일을 하나도 찾지 못했습니다")

    # 4) 판정 못 한 것 — 조용히 넘기지 않는다
    if unknown:
        findings += len(unknown)
        lines += ["## 판정하지 못한 항목", "",
                  "점검이 처리하지 못한 것들입니다. 서식이 바뀌었을 수 있습니다.", ""]
        lines += [f"- {u}" for u in unknown] + [""]

    if findings == 0:
        lines += ["확인이 필요한 항목이 없습니다.", "",
                  f"- 대조한 시험: {len(listed)}건 · 모두 등록부와 일치",
                  f"- 가장 최근 검토일: {newest.isoformat() if newest else '?'}"]
    else:
        lines += ["---", "",
                  "*이 점검은 문자열 비교만 합니다. 무엇을 고칠지는 사람이 정합니다.*"]

    report = "\n".join(lines)
    print(report)

    out = None
    if "-o" in sys.argv:
        out = Path(sys.argv[sys.argv.index("-o") + 1])
        out.write_text(report + "\n", encoding="utf-8")

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"findings={findings}\n")

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
