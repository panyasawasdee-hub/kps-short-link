# KPS Link

ระบบย่อลิงก์และสร้าง QR Code ตาม [สเปก](KPS_Short_Link_QR_PROJECT_SPEC.md) และภาพอ้างอิงในโฟลเดอร์นี้ หน้าเว็บใช้ Vite กับ JavaScript ธรรมดา โฮสต์บน GitHub Pages ส่วน Google Apps Script จัดการข้อมูลใน Google Sheets และเปิดลิงก์สั้น QR ถูกสร้างในเบราว์เซอร์ด้วยแพ็กเกจ `qrcode` โดยเข้ารหัส **Short URL** จึงแก้ปลายทางภายหลังได้โดยไม่ต้องพิมพ์ QR ใหม่

## สิ่งที่ทำได้

- สร้างลิงก์สั้นอัตโนมัติด้วย Base62 หรือกำหนด alias; ตั้งชื่อและวันหมดอายุ
- คัดลอกลิงก์ ดาวน์โหลด QR เป็น PNG หรือ SVG ขนาด 256, 512, 1024 px
- ค้นหา กรอง ส่งออก CSV ดูรายละเอียด แก้ปลายทาง เปิดและปิดลิงก์
- ดูยอดคลิกพื้นฐาน รายวัน และแดชบอร์ด โดยไม่เก็บ IP หรือข้อมูลส่วนตัว
- หน้าเว็บภาษาไทย รองรับมือถือ และอ้างอิงภาพ `01-home.png` ถึง `05-mobile.png`

## 1. ตั้งค่า Google Apps Script

1. สร้างโปรเจกต์ใหม่ที่ [script.google.com](https://script.google.com/) แล้วนำ `gas/Code.gs` และ `gas/appsscript.json` เข้าไปในโปรเจกต์ (`appsscript.json` คือ manifest ของโปรเจกต์)
2. รันฟังก์ชัน `setup()` และอนุญาตสิทธิ์ ระบบจะสร้าง Spreadsheet 3 ชีต (`links`, `click_logs`, `settings`) และกำหนด `SPREADSHEET_ID`, `NEXT_ID`, `ADMIN_TOKEN` ใน **Project Settings → Script Properties** ชื่อไฟล์ Google Sheet ดูได้ใน Execution log
3. ไปที่ **Deploy → New deployment → Web app** ตั้ง **Execute as: Me** และ **Who has access: Anyone** เพื่อให้ QR/ลิงก์สั้นเปิดได้โดยบุคคลภายนอก
4. คัดลอก URL `/exec` ที่ได้ แล้วเพิ่ม Script Property ชื่อ `WEB_APP_URL` เป็น URL นี้ (ช่วยให้ลิงก์ที่สร้างชี้ deployment ที่ถูกต้อง)
5. หากแก้ `Code.gs` ภายหลัง ให้สร้าง deployment version ใหม่ผ่าน **Manage deployments → Edit → New version**

`ADMIN_TOKEN` ถูกสร้างแบบสุ่มใน Script Properties และไม่ควรใส่ในโค้ด, GitHub, `.env` หรือ URL การเรียก API การอ่านรายการและสถิติ รวมถึงการสร้างและจัดการลิงก์ต้องใช้ token นี้ที่หน้า **ตั้งค่าระบบ** ซึ่งเก็บเฉพาะ `sessionStorage` ของแท็บนั้น เฉพาะ URL redirect `?id=...` ที่เปิดแบบสาธารณะสำหรับผู้สแกน QR

## 2. รันหน้าเว็บในเครื่อง

ต้องมี Node.js 22 ขึ้นไป

```powershell
npm ci
Copy-Item .env.example .env.local
```

แก้ `VITE_GAS_URL` ใน `.env.local` เป็น URL `/exec` ของ deployment แล้วรัน:

```powershell
npm run dev
```

เปิด URL ที่ Vite แสดง ไปที่ **ตั้งค่าระบบ** แล้วใส่ `ADMIN_TOKEN` จาก Script Properties ก่อนสร้างลิงก์

## 3. Deploy GitHub Pages

1. Push โปรเจกต์ขึ้น GitHub branch `main`
2. ตั้ง **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. เพิ่ม repository variable `VITE_GAS_URL` เป็น URL `/exec`
4. เพิ่ม repository variable `VITE_BASE_PATH` เป็น `/ชื่อรีโพ/` เช่น `/kps-short-link/` ถ้าใช้ custom domain ให้ตั้ง `/`
5. Workflow ที่ `.github/workflows/pages.yml` จะ build และ deploy เมื่อ push `main` หรือกด Run workflow

หาก URL deployment เปลี่ยน ต้องแก้ `WEB_APP_URL` ใน Script Properties และ `VITE_GAS_URL` ของหน้าเว็บให้ตรงกัน จากนั้น build/deploy ใหม่

## รูปแบบข้อมูล

`links`: id, code, alias, target_url, title, created_at, updated_at, expires_at, status, clicks, last_clicked_at  
`click_logs`: timestamp, code, date, hour  
`settings`: key, value (เตรียมไว้สำหรับการขยายระบบ)

API ทั้งอ่านและเขียนใช้ form POST ผ่าน iframe เพื่อเลี่ยงข้อจำกัด CORS ของ GAS Web Apps; ทุกคำสั่งตรวจ `ADMIN_TOKEN` ที่ GAS ไม่มี token ในไฟล์หน้าเว็บ การ redirect ใช้หน้า HTML ขนาดเล็กเพราะ GAS Web App ส่ง HTTP 302 โดยตรงไม่ได้

## ข้อจำกัด

- ยังไม่ได้ deploy จริง เพราะต้องใช้บัญชี Google และ GitHub ของโรงเรียน
- การนับคลิกเขียน Google Sheets หนึ่งครั้งต่อคลิก เหมาะกับปริมาณใช้งานระดับโรงเรียนทั่วไป หากทราฟฟิกสูงมากควรเปลี่ยนเป็นการบันทึกแบบ batch
- `CacheService` เร่งการอ่านปลายทาง และล้าง cache ทันทีเมื่อแก้หรือปิดลิงก์
- โค้ดอัตโนมัติ 5 ตัวอักษรขึ้นไป อิงจากลำดับ ID จึงคาดเดาได้; token ป้องกันการอ่านข้อมูลจัดการและแก้ไข แต่ผู้ที่ทราบ Short URL ยังเปิดปลายทางได้ตามปกติ
