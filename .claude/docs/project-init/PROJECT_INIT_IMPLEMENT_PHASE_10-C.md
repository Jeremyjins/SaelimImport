# Phase 10-C: Mobile Responsive Optimization - Implementation Plan

**Date:** 2026-03-06
**Status:** In Progress
**Dependencies:** Phase 10-A (Header fix, ErrorBanner) - Complete

---

## Scope

**P0-3** Settings pages NO mobile layout
**P1-3** Saelim header responsive
**P1-4** PageContainer mobile padding
**P2-4** Customs form card style
**P2-5** Filter bar breakpoint standardization (sm: → md:)
**P2-6** Empty states with icon + CTA button
**P2-8** Delete dialog spinners
**P3-3** Content editor mobile toolbar improvements

---

## Agent Team

| Role | Responsibility |
|------|---------------|
| Architect (lead) | Planning, coordination |
| Frontend Dev | All UI changes |

No backend changes needed for Phase 10-C.

---

## File Ownership

| File | Task |
|------|------|
| `app/components/layout/page-container.tsx` | P1-4 responsive padding |
| `app/routes/_saelim.tsx` | P1-3 header px-8 → px-4 md:px-8 |
| `app/routes/_layout.settings.organizations.tsx` | P0-3 mobile card layout |
| `app/routes/_layout.settings.products.tsx` | P0-3 mobile card layout |
| `app/routes/_layout.settings.users.tsx` | P0-3 mobile card layout |
| `app/components/customs/customs-form.tsx` | P2-4 Card component |
| `app/routes/_layout.po.tsx` | P2-5 filter bar + P2-6 empty state |
| `app/routes/_layout.pi.tsx` | P2-5 filter bar + P2-6 empty state |
| `app/routes/_layout.shipping.tsx` | P2-5 filter bar + P2-6 empty state |
| `app/routes/_layout.orders.tsx` | P2-5 filter bar + P2-6 empty state |
| `app/routes/_layout.customs.tsx` | P2-6 empty state |
| `app/routes/_layout.delivery.tsx` | P2-5 filter bar + P2-6 empty state |
| `app/routes/_layout.delivery.$id.tsx` | P2-8 delete spinner |
| `app/components/content/content-editor-toolbar.tsx` | P3-3 touch targets |

---

## Tasks

### TASK-1: PageContainer responsive padding [P1-4]
- [ ] `p-6` → `p-4 md:p-6`
- [ ] `gap-6` → `gap-4 md:gap-6`

### TASK-2: Saelim header responsive [P1-3]
- [ ] `px-8` → `px-4 md:px-8` in main header

### TASK-3: Settings organizations mobile card [P0-3]
- [ ] Wrap Table in `hidden md:block`
- [ ] Add mobile card section `md:hidden`
- [ ] Cards show: type badge, name_en, name_ko, phone, edit/delete buttons

### TASK-4: Settings products mobile card [P0-3]
- [ ] Wrap Table in `hidden md:block`
- [ ] Add mobile card section `md:hidden`
- [ ] Cards show: name, gsm, width_mm, hs_code, edit/delete buttons

### TASK-5: Settings users mobile card [P0-3]
- [ ] Wrap Table in `hidden md:block`
- [ ] Add mobile card section `md:hidden`
- [ ] Cards show: name/email, org, type badge, status, delete button

### TASK-6: Customs form Card component [P2-4]
- [ ] Import Card from `~/components/ui/card`
- [ ] Replace basic info div with Card
- [ ] Replace etc fee div with Card
- [ ] Replace total div with Card

### TASK-7: Filter bar standardization [P2-5]
- [ ] po.tsx: sm: → md:
- [ ] pi.tsx: sm: → md:
- [ ] shipping.tsx: sm: → md:
- [ ] orders.tsx: sm: → md:
- [ ] delivery.tsx: sm: → md:

### TASK-8: Empty states with CTA [P2-6]
- [ ] PO: FileText icon + "PO 작성하기" link
- [ ] PI: FileSpreadsheet icon + "PI 작성하기" link
- [ ] Shipping: Ship icon + "선적서류 작성하기" link
- [ ] Orders: Package icon + "오더 생성하기" (dialog button)
- [ ] Customs: Receipt icon + "통관서류 작성하기" link
- [ ] Delivery: Truck icon, no CTA (no direct create)

### TASK-9: Delete spinner on delivery.$id.tsx [P2-8]
- [ ] Add Loader2 spinner to dropdown trigger when isDeleting

### TASK-10: Content editor touch targets [P3-3]
- [ ] Increase ToolbarButton min size for mobile touch targets

---

## Implementation Notes

- Empty states: only show CTA when `!search` (no search active)
- Desktop table empty rows keep simple text (CTA in header already exists)
- Mobile empty states show full icon + text + CTA
- CustomsFeeInput already renders its own card-like border inside grid; only plain divs in customs-form need Card replacement
- orders.$id.tsx already has delete spinner; only delivery.$id.tsx needs fix

---

## Status

| Task | Status | Notes |
|------|--------|-------|
| TASK-1 PageContainer | ✅ Complete | p-4 md:p-6, gap-4 md:gap-6 |
| TASK-2 Saelim header | ✅ Complete | px-4 md:px-8 |
| TASK-3 Orgs mobile | ✅ Complete | Card layout added |
| TASK-4 Products mobile | ✅ Complete | Card layout added |
| TASK-5 Users mobile | ✅ Complete | Card layout added |
| TASK-6 Customs form Card | ✅ Complete | Card component used |
| TASK-7 Filter bar md: | ✅ Complete | All list pages updated |
| TASK-8 Empty states | ✅ Complete | Icon + CTA added |
| TASK-9 Delivery spinner | ✅ Complete | Loader2 on trigger |
| TASK-10 Toolbar touch | ✅ Complete | h-8 w-8 on mobile |
