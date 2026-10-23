# MHR-CFW Web UI

رابط گرافیکی **محلی** برای پروژه [mhr-cfw](https://github.com/denuitt1/mhr-cfw)

> **توجه مهم**  
> این پروژه یک **ابزار غیررسمی کمکی** برای کار اصلی **denuitt1** است.  
> ما رله و منطق Domain-Fronting را نساخته‌ایم.  
> فقط یک رابط گرافیکی ساخته‌ایم تا راه‌اندازی و استفاده برای کاربران ساده‌تر شود.

---

## قابلیت‌ها

- تم‌های **تیره / روشن / نئون**
- زبان **فارسی و انگلیسی** (با پشتیبانی کامل RTL)
- بررسی وابستگی‌ها + نصب با یک کلیک
- فرم تنظیمات (Auth Key، Deployment ID، پورت‌ها و …)
- **ذخیره دائمی تنظیمات** — یک‌بار وارد کنید؛ دفعه بعد فقط روشن/خاموش
- دکمه‌های بزرگ Start / Stop در بالای صفحه
- باز شدن خودکار مرورگر با اجرای برنامه
- لاگ زنده + شمارنده تقریبی درخواست‌ها

---

## پیش‌نیاز

- Python **3.10** یا بالاتر

---

## نصب و اجرا (ویندوز)

```powershell
cd مسیر\پوشه\mhr-cfw-webui

python -m pip install -r requirements-webui.txt

# اگر PyPI محدود بود:
python -m pip install -r requirements-webui.txt -i https://mirror-pypi.runflare.com/simple/ --trusted-host mirror-pypi.runflare.com

python app.py
```

یا دوبار کلیک روی:

```
run_webui.bat
```

مرورگر به‌صورت خودکار باز می‌شود:

```
http://127.0.0.1:5050
```

---

## استفاده روزمره (بعد از تنظیم اول)

1. فقط `python app.py` یا `run_webui.bat` را اجرا کنید.
2. مرورگر باز می‌شود.
3. دکمه **شروع پروکسی** یا **توقف** را بزنید.

نیازی به وارد کردن دوباره Auth Key و Deployment ID نیست؛ از فایل `config.json` خوانده می‌شوند.

### بار اول

1. بخش **پیکربندی** را باز کنید.
2. Auth Key و Deployment ID را وارد کنید.
3. **ذخیره تنظیمات** را بزنید.
4. **شروع پروکسی** را بزنید.

---

## پورت‌های پیش‌فرض

| سرویس | آدرس |
|--------|------|
| HTTP Proxy | `127.0.0.1:8085` |
| SOCKS5 | `127.0.0.1:1080` |

---

## ارتباط با پروژه اصلی

| مورد | مالک |
|------|------|
| رله، GAS، Cloudflare Worker، منطق MITM | **denuitt1** — [mhr-cfw](https://github.com/denuitt1/mhr-cfw) |
| این Web UI (رابط، تم، زبان، Start/Stop) | همین مخزن |

لطفاً پروژه اصلی را ستاره بزنید و حمایت کنید:

https://github.com/denuitt1/mhr-cfw

---

## ساختار پوشه

```
mhr-cfw-webui/
├── app.py                 # سرور Flask + SocketIO
├── main.py                # ورودی اصلی پروژه اصلی
├── setup.py               # ویزارد خط فرمان اصلی
├── config.example.json
├── config.json            # بعد از ذخیره تنظیمات ساخته می‌شود (در گیت نیست)
├── requirements.txt
├── requirements-webui.txt
├── run_webui.bat / .sh
├── src/                   # سورس پروکسی اصلی
├── templates/
├── static/
└── README.md
```

---

## انتشار روی GitHub خودتان

```bash
git init
git add .
git commit -m "MHR-CFW Web UI — helper for denuitt1/mhr-cfw"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mhr-cfw-webui.git
git push -u origin main
```

---

## سلب مسئولیت

این رابط فقط برای راحتی استفاده است.  
استفاده از رله اصلی تابع مجوز و سلب‌مسئولیت پروژه اصلی است.  
رعایت قوانین محلی و شرایط استفاده گوگل و کلادفلر بر عهده کاربر است.

---

## مجوز

کد اصلی mhr-cfw تحت مجوز خودش (MIT در مخزن بالادستی) باقی می‌ماند.  
کد این Web UI نیز تحت MIT منتشر می‌شود.
