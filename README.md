# 🟣 Queuely — Smart Virtual Queue & Appointment Management

A full-stack SaaS platform that lets businesses manage virtual queues and appointments in real time, while customers can join queues, book slots, and track their position live.

**Live Demo:** [https://queuely-qrgs.onrender.com](https://queuely-qrgs.onrender.com)

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas (Mongoose) |
| Views | EJS (server-side rendering) |
| Realtime | Socket.io |
| Auth | JWT (access + refresh tokens via HTTP-only cookies) |
| Email | Resend HTTP API |
| File Uploads | Cloudinary |
| Deployment | Render |

---

## ✨ Features

- **User Roles** — Customer, Business Owner, Staff, Admin
- **Virtual Queue System** — Real-time ticket tracking with live position updates via Socket.io
- **Appointment Booking** — Book time slots at specific branches
- **Business Management** — Create businesses with multiple branches and services
- **Staff Invitations** — Invite staff members via email link
- **Security Question Password Recovery** — Reset password without relying on email delivery
- **In-App Notifications** — Real-time alerts for queue and appointment updates
- **Analytics Dashboard** — Queue stats, no-show rate, and busiest-hour trends for business owners
- **Admin Panel** — Verify/suspend businesses, manage users, audit logs
- **Appointment Reminders** — Automated cron job for email reminders
- **QR Code Tickets** — Auto-generated QR codes for each ticket
- **Post-Service Reviews** — Customers can rate their experience after being served

---

## 📁 Project Structure

```
queuely/
├── server.js                  # Entry point
├── app.js                     # Express setup, middleware, routes
├── config/
│   ├── db.js                  # MongoDB connection
│   ├── email.js               # Resend HTTP API email sending
│   ├── cloudinary.js          # Cloudinary config
│   └── socket.js              # Socket.io initialization
├── controllers/               # Route handler logic
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── business.controller.js
│   ├── branch.controller.js
│   ├── queue.controller.js
│   ├── appointment.controller.js
│   └── ...
├── models/                    # Mongoose schemas
│   ├── User.js
│   ├── Business.js
│   ├── Branch.js
│   ├── Service.js
│   ├── Ticket.js
│   ├── Appointment.js
│   └── ...
├── routes/                    # Express route definitions
├── services/                  # Business logic
│   ├── queue.service.js
│   ├── appointment.service.js
│   ├── notification.service.js
│   └── reminder.service.js
├── middleware/                # Auth, error handling, validation
├── utils/                     # Helpers (email templates, QR code, etc.)
├── views/                     # EJS templates
│   ├── auth/
│   ├── business/
│   ├── customer/
│   ├── admin/
│   └── public/
├── .env.example               # Environment variable template
└── render.yaml                # Render deployment config
```

---

## ⚙️ Local Setup & Installation

### Prerequisites

Make sure you have these installed:

- [Node.js](https://nodejs.org/) v18 or higher
- [Git](https://git-scm.com/)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) account
- A [Resend](https://resend.com) account (for email)
- A [Cloudinary](https://cloudinary.com) account (optional, for image uploads)

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/SabavatSrikanth/Queuely.git
cd Queuely
```

---

### Step 2 — Install dependencies

```bash
npm install
```

---

### Step 3 — Set up environment variables

Copy the example env file:

```bash
cp .env.example .env
```

Then open `.env` and fill in your values:

```env
# ─── App ──────────────────────────────────────────────
NODE_ENV=development
PORT=3000
APP_NAME=Queuely
CLIENT_URL=http://localhost:3000

# ─── MongoDB ──────────────────────────────────────────
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/queuely

# ─── JWT ──────────────────────────────────────────────
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=another_long_random_secret_here
JWT_REFRESH_EXPIRES_IN=30d

# ─── Email (Resend HTTP API) ──────────────────────────
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Queuely <onboarding@resend.dev>

# ─── Cloudinary (optional) ────────────────────────────
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ─── Rate Limiting ────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=200
```

---

### Step 4 — Set up MongoDB Atlas

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a free cluster
2. Create a database user with a username and password
3. Whitelist your IP address (or use `0.0.0.0/0` for all IPs)
4. Copy the connection string and paste it into `MONGODB_URI` in your `.env`

---

### Step 5 — Set up Resend (Email)

1. Go to [resend.com](https://resend.com) and create a free account
2. Go to **API Keys → Create API Key**
3. Copy the key and paste it into `RESEND_API_KEY` in your `.env`
4. By default, emails can only be sent to the email you signed up with, using the sender `onboarding@resend.dev`. To send to any recipient, verify a custom domain under **Domains** in your Resend dashboard.

---

### Step 6 — Run the app

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

Open your browser and go to: [http://localhost:3000](http://localhost:3000)

---

## 🌐 Deploying to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new **Web Service**
3. Connect your GitHub repository
4. Set the following:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add all environment variables from your `.env` file in the Render dashboard under **Environment**
6. Click **Deploy**

> ⚠️ On Render's free tier, the server spins down after inactivity and may take 50+ seconds to wake up on the first request. Outbound SMTP ports are also blocked on Render's free tier — this is why the project uses Resend's HTTP API instead of traditional SMTP for email delivery.

---

## 👤 User Roles

| Role | Access |
|---|---|
| `customer` | Join queues, book appointments, track tickets, leave reviews |
| `business_owner` | Manage business, branches, services, queues, staff |
| `staff` | Manage queues and appointments at branch level |
| `super_admin` | Full platform access, verify/suspend businesses, manage users, audit logs |

---

## 📬 Registration & Password Recovery

- Registration creates an account immediately — no email verification step required, ensuring signup works reliably regardless of email deliverability.
- During signup, users can optionally set a **security question** for password recovery.
- Forgot password flow: enter email → answer your security question → set a new password directly. No email dependency.

---

## 🛠️ Available Scripts

```bash
npm run dev      # Start with nodemon (auto-restart on changes)
npm start        # Start production server
npm run seed     # Seed the database with sample data
```

---

## ⚠️ Known Limitations

- Transactional emails (appointment confirmations, reminders, staff invites) currently deliver reliably only to the email address used to sign up with Resend, until a custom domain is verified. This does not affect core app functionality — queues, appointments, real-time updates, and reviews all work independently of email delivery.

---

## 📄 License

MIT
