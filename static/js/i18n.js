const I18N = {
  en: {
    subtitle: "Local control panel for the domain-fronting relay",
    "status.stopped": "Stopped",
    "status.running": "Running",
    "stats.requests": "Requests",
    "btn.start": "Start Proxy",
    "btn.stop": "Stop",
    "btn.refresh": "Refresh",
    "btn.install": "Install / Update packages",
    "btn.save": "Save Config",
    "btn.scan": "Scan Google IPs",
    "btn.clear": "Clear",
    "btn.copy": "Copy",
    "deps.title": "Dependencies",
    "deps.mirror": "Use PyPI mirror (Iran)",
    "config.title": "Configuration",
    "config.auth_key": "Auth Key (AUTH_KEY)",
    "config.auth_key_hint": "Must match AUTH_KEY in Code.gs",
    "config.script_id": "Deployment ID(s)",
    "config.script_id_hint": "Comma-separated for multiple scripts",
    "config.listen_host": "Listen Host",
    "config.listen_port": "HTTP Port",
    "config.socks5": "Enable SOCKS5",
    "config.socks5_port": "SOCKS5 Port",
    "config.lan_sharing": "LAN Sharing (bind 0.0.0.0)",
    "config.front_domain": "Front Domain",
    "config.log_level": "Log Level",
    "config.persist_hint": "Set once — next time values are loaded automatically. No need to re-enter.",
    "logs.title": "Live Logs",
    "hero.hint_ready": "Settings are saved. Just turn the proxy on or off.",
    "hero.hint_setup": "First time: open Configuration, enter Auth Key & Deployment ID, then Save.",
    footer:
      'This Web UI is an unofficial helper for the original project <a href="https://github.com/denuitt1/mhr-cfw" target="_blank" rel="noopener">mhr-cfw by denuitt1</a>. We only built a graphical interface to make setup and usage easier for users.',
    "toast.saved": "Config saved",
    "toast.started": "Proxy started",
    "toast.stopped": "Proxy stopped",
    "toast.copied": "Logs copied",
    "toast.install": "Installing packages…",
    "configs.title": "Configs",
    "configs.hint": "Use these values in your client (v2rayN, FoxyProxy, Telegram, …). If LAN Sharing is on, the local network IP is shown instead of 127.0.0.1.",
    "configs.socks": "SOCKS5",
    "configs.http": "HTTP Proxy",
    "configs.telegram": "Telegram (SOCKS5)",
    "configs.lan_note": "LAN Sharing is enabled — other devices on your Wi-Fi can use the LAN IP below.",
    "toast.copied_cfg": "Config copied",
    "toast.error": "Error",
  },
  fa: {
    subtitle: "پنل کنترل محلی رله Domain-Fronting",
    "status.stopped": "متوقف",
    "status.running": "در حال اجرا",
    "stats.requests": "درخواست‌ها",
    "btn.start": "شروع پروکسی",
    "btn.stop": "توقف",
    "btn.refresh": "بروزرسانی",
    "btn.install": "نصب / بروزرسانی پکیج‌ها",
    "btn.save": "ذخیره تنظیمات",
    "btn.scan": "اسکن آی‌پی گوگل",
    "btn.clear": "پاک کردن",
    "btn.copy": "کپی",
    "deps.title": "وابستگی‌ها",
    "deps.mirror": "استفاده از میرور PyPI (ایران)",
    "config.title": "پیکربندی",
    "config.auth_key": "کلید احراز هویت (AUTH_KEY)",
    "config.auth_key_hint": "باید با AUTH_KEY داخل Code.gs یکی باشد",
    "config.script_id": "آیدی دیپلویمنت (Deployment ID)",
    "config.script_id_hint": "برای چند اسکریپت با کاما جدا کنید",
    "config.listen_host": "آدرس گوش دادن",
    "config.listen_port": "پورت HTTP",
    "config.socks5": "فعال‌سازی SOCKS5",
    "config.socks5_port": "پورت SOCKS5",
    "config.lan_sharing": "اشتراک‌گذاری در شبکه محلی (0.0.0.0)",
    "config.front_domain": "دامنه فرانت",
    "config.log_level": "سطح لاگ",
    "config.persist_hint": "یک‌بار تنظیم کنید؛ دفعه بعد همان مقادیر لود می‌شوند و نیازی به ورود مجدد نیست.",
    "logs.title": "لاگ زنده",
    "hero.hint_ready": "تنظیمات ذخیره شده‌اند. فقط پروکسی را روشن یا خاموش کنید.",
    "hero.hint_setup": "بار اول: بخش پیکربندی را باز کنید، Auth Key و Deployment ID را وارد و ذخیره کنید.",
    footer:
      'این رابط وب یک ابزار غیررسمی کمکی برای پروژه اصلی <a href="https://github.com/denuitt1/mhr-cfw" target="_blank" rel="noopener">mhr-cfw متعلق به denuitt1</a> است. ما صرفاً برای راحت‌تر شدن کار کاربران یک رابط گرافیکی ساخته‌ایم.',
    "toast.saved": "تنظیمات ذخیره شد",
    "toast.started": "پروکسی شروع شد",
    "toast.stopped": "پروکسی متوقف شد",
    "toast.copied": "لاگ‌ها کپی شد",
    "toast.install": "در حال نصب پکیج‌ها…",
    "configs.title": "کانفیگ‌ها",
    "configs.hint": "این مقادیر را در کلاینت (v2rayN، FoxyProxy، تلگرام و …) وارد کنید. اگر LAN Sharing فعال باشد، به‌جای 127.0.0.1 آی‌پی شبکه محلی نشان داده می‌شود.",
    "configs.socks": "SOCKS5",
    "configs.http": "HTTP Proxy",
    "configs.telegram": "تلگرام (SOCKS5)",
    "configs.lan_note": "اشتراک‌گذاری LAN فعال است — دستگاه‌های دیگر روی همان وای‌فای می‌توانند از آی‌پی شبکه استفاده کنند.",
    "toast.copied_cfg": "کانفیگ کپی شد",
    "toast.error": "خطا",
  },
};

let currentLang = localStorage.getItem("mhr_lang") || "fa";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function applyI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "fa" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = val;
    } else if (key === "footer") {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLang);
  });
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("mhr_lang", lang);
  applyI18n();
}
