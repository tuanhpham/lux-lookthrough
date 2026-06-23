# Dùng Screener trên điện thoại (PWA — miễn phí, không cần Rust/Xcode)

App này giờ là một **PWA** (Progressive Web App): deploy lên web một lần, rồi
"Add to Home Screen" trên điện thoại → có **icon app ở màn hình chính**, mở
**toàn màn hình** như một app thật. Dùng được ở bất cứ đâu có mạng. **$0**, không
cần tài khoản Apple, không hết hạn 7 ngày.

> Việc *deploy* cần tài khoản **Cloudflare miễn phí** của bạn (chạy trên máy Mac).
> Việc *cài lên điện thoại* chỉ cần mở link trong Safari/Chrome.

---

## Bước 1 — Deploy lên Cloudflare Pages (làm 1 lần trên máy Mac)

```bash
# build từ thư mục gốc của monorepo (cờ --workspace + tsc/vite chỉ chạy ở đây)
cd screener-ts
npm install                                    # lần đầu / sau khi clone mới
npm run build --workspace @screener/core
npm run build --workspace @screener/desktop    # → thư mục apps/desktop/dist

# deploy TỪ apps/desktop để wrangler tìm thấy cả dist/ VÀ functions/ (các proxy
# api/yahoo, api/finnhub, …). Deploy từ chỗ khác → web KHÔNG có proxy → không có dữ liệu.
cd apps/desktop
# Lần đầu wrangler sẽ mở trình duyệt cho bạn đăng nhập Cloudflare (free).
npx wrangler pages deploy dist --project-name screener
```

Kết thúc, Cloudflare in ra một link cố định, ví dụ:
```
https://screener.pages.dev
```
(hoặc `https://<hash>.screener.pages.dev` cho bản xem trước). Dùng link
`*.pages.dev` chính là bản production.

> **Tùy chọn:** thêm Finnhub làm nguồn dữ liệu dự phòng:
> ```bash
> npx wrangler pages secret put FINNHUB_API_KEY --project-name screener
> ```

### Deploy lại sau khi sửa code
Chạy lại: `cd screener-ts && npm run build --workspace @screener/core && npm run build --workspace @screener/desktop && cd apps/desktop && npx wrangler pages deploy dist --project-name screener`.
Service worker tự nhận bản mới (đã đặt `CACHE_VERSION` để dọn cache cũ). Nếu trên
máy thấy bản cũ "dính", kéo để refresh hoặc đóng/mở lại app.

---

## Bước 2 — Cài lên iPhone (Safari)

1. Mở **Safari** (phải là Safari, không phải Chrome) → vào link `https://screener.pages.dev`.
2. Bấm nút **Chia sẻ** (hình vuông có mũi tên ↑) ở thanh dưới.
3. Cuộn xuống chọn **"Thêm vào MH chính" / "Add to Home Screen"**.
4. Đặt tên (mặc định *Screener*) → **Thêm**.
5. Giờ có **icon Screener** ở màn hình chính, mở ra chạy **toàn màn hình** như app.

## Bước 2 (Android — Chrome)

1. Mở **Chrome** → vào link.
2. Menu ⋮ → **"Cài đặt ứng dụng" / "Install app"** (hoặc Chrome tự hiện banner "Install").
3. Xác nhận → icon xuất hiện ở màn hình chính / ngăn ứng dụng.

---

## Câu hỏi thường gặp

**Có chạy offline không?**
Mở app khi offline thì **giao diện vẫn lên** (đã cache app shell), nhưng dữ liệu
cổ phiếu cần mạng — không có mạng thì danh sách sẽ trống (đúng như khi một mã
không tải được). Dữ liệu **không bao giờ bị cache** (luôn lấy mới).

**Khác gì app native?**
Đây là web app chạy trong "vỏ" full-screen. Đủ tốt cho dùng cá nhân khi đi đường.
Nếu sau này muốn app iOS native thật (qua App Store hoặc Simulator), xem nhánh
Tauri iOS — nhưng cái đó cần cài Rust + Xcode.

**Tốn tiền không?**
Không. Cloudflare Pages free, Yahoo free, "Add to Home Screen" free.

---

## Đã thêm gì để có PWA (tham khảo kỹ thuật)

| File | Vai trò |
|---|---|
| `public/manifest.webmanifest` | tên app, icon, màu, `display: standalone` |
| `public/sw.js` | service worker: cache app shell, **không** cache `/api/*` |
| `public/icons/*` | icon 192 / 512 / maskable / apple-touch |
| `index.html` | link manifest + meta iOS (`apple-mobile-web-app-*`) |
| `src/main.ts` | đăng ký service worker (chỉ ở web build, bỏ qua trong Tauri) |
| `src/styles.css` | `env(safe-area-inset-*)` cho iPhone notch khi standalone |
