# 🚜 FARMINGBOT (Minecraft Bot Manager & Web Dashboard)

![Status](https://img.shields.io/badge/Durum-Geli%C5%9Ftirilmeye%20A%C3%A7%C4%B1k%20%2F%20WIP-yellow?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge)
![Mineflayer](https://img.shields.io/badge/Mineflayer-Bot-blue?style=for-the-badge)
![CI](https://img.shields.io/badge/CI%2FCD-Active-success?style=for-the-badge)

**FARMINGBOT**, Mineflayer kütüphanesi kullanarak Minecraft sunucularında otomatik tarım (kaktüs vb.) yapan bot ordusunu web paneli üzerinden yönetmeye yarayan tam yığın (full-stack) uygulamadır.

---

## 📌 Proje Durumu (Project Status)

- **Durum:** 🟡 **Geliştirilmeye Açık / WIP (Work in Progress)**
- **Test & CI/CD:** GitHub Actions otomasyonu eklendi.
- **Konfigürasyon:** `config.json` ile port ve bot yönetimi özelleştirilebilir.

---

## 🚀 Özellikler

- **Web Dashboard:** Express & Socket.io tabanlı bot takip ve kontrol paneli.
- **Bot Yöneticisi (`bot-manager.js`):** Birden fazla botun sunucuya bağlanmasını ve görev dağılımını yönetir.
- **Kaktüs Çiftliği Modülü:** Otomatik kaktüs toplama ve depolama mekanizması.

---

## 🛠️ Kurulum ve Çalıştırma

```bash
npm install
npm start
```

Web arayüzüne `http://localhost:3000` adresinden ulaşabilirsiniz.

---

## 📄 Lisans

MIT License
