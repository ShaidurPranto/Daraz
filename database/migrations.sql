-- PostgreSQL Schema for Daraz eCommerce Platform
-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_admin BOOLEAN DEFAULT FALSE
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    discount_price NUMERIC(10, 2),
    stock INT NOT NULL DEFAULT 0,
    flash_sale BOOLEAN DEFAULT FALSE,
    category_id INT NOT NULL,
    reliability_score NUMERIC(3, 1) DEFAULT 0,
    ai_comment TEXT,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
);

-- Carts Table
CREATE TABLE IF NOT EXISTS carts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- CartItems Table
CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INT NOT NULL,
    product_id UUID NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    order_status VARCHAR(50) NOT NULL,
    shipping_address TEXT,
    tran_id VARCHAR(255),
    val_id VARCHAR(255),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- OrderItems Table
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    rating INT CHECK (
        rating >= 1
        AND rating <= 5
    ),
    review TEXT,
    review_date TIMESTAMPTZ,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- Bookings Table (Temporary reservations during checkout)
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    order_id UUID NOT NULL,
    booking_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

CREATE INDEX IF NOT EXISTS idx_carts_user ON carts (user_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);

CREATE INDEX IF NOT EXISTS idx_order_user ON orders (user_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_order_items_reviews ON order_items (product_id)
WHERE
    rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_product ON bookings (product_id);

CREATE INDEX IF NOT EXISTS idx_booking_user ON bookings (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_tran_id ON orders (tran_id)
WHERE
    tran_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders (expires_at)
WHERE
    expires_at IS NOT NULL;

-- User Activity Table (last_seen + last_cart_activity per user)
CREATE TABLE IF NOT EXISTS user_activity (
    user_id            UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_cart_activity TIMESTAMPTZ
);

-- Audit Logs Table (every API request/response)
CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID REFERENCES users (id) ON DELETE SET NULL,
    user_name    VARCHAR(255),
    user_email   VARCHAR(255),
    method       VARCHAR(10) NOT NULL,
    path         TEXT NOT NULL,
    frontend_url TEXT,
    ip           TEXT,
    user_agent   TEXT,
    status_code  INT,
    req_body     JSONB,
    res_body     JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_path       ON audit_logs (path);
CREATE INDEX IF NOT EXISTS idx_user_activity_user    ON user_activity (user_id);

-- Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC(10, 2),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    usage_limit INT,
    used_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    promotion_channels TEXT[] NOT NULL DEFAULT '{}',
    promotion_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code     ON coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_end_date ON coupons (end_date);