# HRMS - Anonymous Feedback System

A secure anonymous feedback system where staff can share thoughts confidentially while admins can view and manage submissions.

## Features

- **Anonymous Submission**: Staff can submit feedback without any identification
- **Categories**: Suggestions, Concerns, Complaints, Praise, Questions, Other
- **Admin Dashboard**: View all feedback, filter by category/status, add private notes
- **Statistics**: Track total feedback, unread items, weekly/monthly trends

## Quick Start

### 1. Database Setup (PostgreSQL)

```sql
-- Create database
CREATE DATABASE hrms_db;

-- Connect to database and run init.sql
\c hrms_db
\i backend/db/init.sql
```

### 2. Backend Setup

```bash
cd backend

# Copy environment file and edit with your settings
cp .env.example .env

# Install dependencies
npm install

# Start server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start React app
npm start
```

### 4. Create Admin Account

Make a POST request to create your admin:

```bash
curl -X POST http://localhost:5000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "yourpassword", "setupKey": "HRMS_SETUP_2024"}'
```

## URLs

- **Staff Feedback Form**: http://localhost:3000
- **Admin Login**: http://localhost:3000/admin/login
- **Admin Dashboard**: http://localhost:3000/admin/dashboard

## Environment Variables

Edit `backend/.env`:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hrms_db
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=change_this_to_random_string
PORT=5000
```

## API Endpoints

### Public
- `POST /api/feedback/submit` - Submit anonymous feedback

### Admin (Requires Authentication)
- `GET /api/feedback/all` - Get all feedback (with pagination/filters)
- `PATCH /api/feedback/:id/read` - Mark as read/unread
- `PATCH /api/feedback/:id/notes` - Add admin notes
- `GET /api/feedback/stats` - Get statistics
- `POST /api/auth/login` - Admin login

---

## Deployment Guide

### Step 1: Push to GitHub

1. Create a new repository on GitHub (don't initialize with README)
2. Run these commands:
```bash
git add .
git commit -m "Initial commit - HRMS Anonymous Feedback"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2: Deploy Database on Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click **New** → **PostgreSQL**
3. Fill in:
   - Name: `hrms-db`
   - Database: `hrms_db`
   - User: `hrms_user`
4. Click **Create Database**
5. Wait for it to be ready, then copy the **External Database URL**

### Step 3: Deploy Backend on Render

1. Click **New** → **Web Service**
2. Connect your GitHub repo
3. Configure:
   - Name: `hrms-backend`
   - Root Directory: `backend`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add Environment Variables:
   - `DATABASE_URL` = (paste External Database URL from step 2)
   - `JWT_SECRET` = (generate a random string)
   - `FRONTEND_URL` = (leave empty for now, add after Vercel deploy)
5. Click **Create Web Service**
6. Copy the service URL (e.g., `https://hrms-backend-xxx.onrender.com`)

### Step 4: Initialize Database Tables

After backend deploys, run the SQL from `backend/db/init.sql` in your Render PostgreSQL dashboard (Shell tab).

### Step 5: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **Add New** → **Project**
3. Import your GitHub repo
4. Configure:
   - Framework Preset: `Create React App`
   - Root Directory: `frontend`
5. Add Environment Variable:
   - `REACT_APP_API_URL` = `https://hrms-backend-xxx.onrender.com/api` (your Render URL + /api)
6. Click **Deploy**
7. Copy your Vercel URL (e.g., `https://hrms-xxx.vercel.app`)

### Step 6: Update Render with Frontend URL

1. Go back to Render → your backend service → Environment
2. Add/Update: `FRONTEND_URL` = `https://hrms-xxx.vercel.app`
3. Redeploy

### Step 7: Create Admin Account

```bash
curl -X POST https://hrms-backend-xxx.onrender.com/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "YOUR_SECURE_PASSWORD", "setupKey": "HRMS_SETUP_2024"}'
```

### Done!

- Staff feedback: `https://hrms-xxx.vercel.app`
- Admin login: `https://hrms-xxx.vercel.app/admin/login`
