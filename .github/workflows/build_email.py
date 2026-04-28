#!/usr/bin/env python3
"""Build the evening-scan HTML email from the four /api JSON dumps."""
import argparse
import datetime
import html as h
import json
import os
import sys
from typing import List


def money(n):
    if n is None:
        return "N/A"
    try:
        return "$" + format(float(n), ",.2f")
    except Exception:
        return "N/A"


def pct(p):
    if p is None:
        return "N/A"
    sign = "" if p < 0 else "+"
    return f"{sign}{p:.1f}%"


def color_pct(p):
    if p is None:
        return "#6b7280"
    return "#16a34a" if p < 0 else "#dc2626"


def render_row(it):
    name = h.escape(str(it.get("name") or ""))
    title_full = it.get("title") or ""
    title = h.escape(title_full[:80])
    link = it.get("listingUrl") or it.get("ebayUrl") or "#"
    pcl = it.get("pricechartingUrl") or ""
    pc_cell = f'<a href="{h.escape(pcl)}" style="color:#2563eb;">PC</a>' if pcl else "—"
    p = it.get("pctOverMarket")
    return (
        "<tr>"
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;">{name}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">{title}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#16a34a;font-weight:600;">{money(it.get("price"))}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">{money(it.get("marketPrice"))}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;color:{color_pct(p)};font-weight:600;">{pct(p)}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;"><a href="{h.escape(link)}" style="color:#2563eb;">View</a> {pc_cell}</td>'
        "</tr>"
    )


def render_table(title: str, rows: List[dict]) -> str:
    head = (
        '<thead><tr>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Card</th>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Title</th>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Price</th>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Market</th>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">% Over</th>'
        '<th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Links</th>'
        '</tr></thead>'
    )
    body = "".join(render_row(r) for r in rows)
    if not rows:
        body = '<tr><td colspan="6" style="padding:14px;color:#9ca3af;font-size:13px;text-align:center;">No listings.</td></tr>'
    return (
        f'<h3 style="margin:24px 0 8px;color:#111;font-family:-apple-system,sans-serif;">{h.escape(title)} '
        f'<span style="color:#6b7280;font-weight:400;font-size:14px;">({len(rows)})</span></h3>'
        f'<table style="width:100%;border-collapse:collapse;font-family:-apple-system,sans-serif;">{head}<tbody>{body}</tbody></table>'
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ebay", required=True)
    ap.add_argument("--fanatics", required=True)
    ap.add_argument("--mercari", required=True)
    ap.add_argument("--tcg", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    ebay = json.load(open(args.ebay))
    fanatics = json.load(open(args.fanatics))
    mercari = json.load(open(args.mercari))
    tcg = json.load(open(args.tcg))

    bin_listings = ((ebay.get("results") or {}).get("buyItNow") or [])[:30]
    auc_listings = ((ebay.get("results") or {}).get("auctions") or [])[:20]
    fan_listings = (fanatics.get("listings") or [])[:30]
    mer_listings = (mercari.get("listings") or [])[:30]
    tcg_listings = (tcg.get("listings") or [])[:30]

    # Normalize ebay listings to share .listingUrl key
    for x in bin_listings + auc_listings:
        if x.get("listingUrl") is None:
            x["listingUrl"] = x.get("ebayUrl")

    total = len(bin_listings) + len(auc_listings) + len(fan_listings) + len(mer_listings) + len(tcg_listings)
    pt_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-7))).strftime("%a %b %d, %Y %I:%M %p")

    html = (
        '<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9fafb;padding:20px;">'
        '<div style="max-width:900px;margin:0 auto;background:white;padding:24px;border-radius:8px;">'
        '<h1 style="color:#111;margin:0 0 8px;">PSA 10 Base Set — Evening Scan</h1>'
        f'<p style="color:#6b7280;margin:0 0 24px;">{pt_now} PT &middot; <strong>{total}</strong> listings across all sources &middot; '
        f'<a href="{h.escape(args.base)}" style="color:#2563eb;">Live dashboard</a></p>'
        + render_table("eBay - Buy It Now", bin_listings)
        + render_table("eBay - Auctions", auc_listings)
        + render_table("Fanatics Collect", fan_listings)
        + render_table("Mercari (last 60 days)", mer_listings)
        + render_table("TCGplayer", tcg_listings)
        + '<p style="margin-top:32px;color:#9ca3af;font-size:11px;">Pokemon Scanner &middot; runs daily at 9pm PT via GitHub Actions.</p>'
        '</div></body></html>'
    )

    with open(args.out, "w") as f:
        f.write(html)
    print(f"Wrote {len(html)} bytes -> {args.out}")
    print(f"  ebay BIN={len(bin_listings)} auc={len(auc_listings)} fan={len(fan_listings)} mer={len(mer_listings)} tcg={len(tcg_listings)}")


if __name__ == "__main__":
    main()
