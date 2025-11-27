-- Create database (run this manually first)
-- CREATE DATABASE hrms_db;

-- Anonymous Feedback Table
CREATE TABLE IF NOT EXISTS anonymous_feedback (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    admin_notes TEXT
);

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON anonymous_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON anonymous_feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_is_read ON anonymous_feedback(is_read);
