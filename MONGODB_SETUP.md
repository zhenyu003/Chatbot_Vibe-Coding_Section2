# MongoDB Atlas setup

The **SSL "internal error" (alert 80)** usually means Atlas is closing the connection. Follow these steps so the app can connect.

## 1. Create a cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign in (or create an account).
2. Create a **free M0 cluster** (e.g. on AWS, region closest to you).
3. Wait until the cluster is created.

## 2. Create a database user

1. In the left sidebar: **Database Access** → **Add New Database User**.
2. Choose **Password** authentication.
3. Set a **username** and **password** (save the password; you’ll need it for the connection string).
4. Set database user privileges to **Atlas Admin** (or “Read and write to any database”).
5. Click **Add User**.

If your password has special characters (`@`, `#`, `:`, `/`, `%`, etc.), you must **URL-encode** them when putting the password in the connection string (e.g. `@` → `%40`, `#` → `%23`). Or avoid special characters in the password.

## 3. Allow your IP (fixes most SSL errors)

1. In the left sidebar: **Network Access** → **Add IP Address**.
2. For local development you can:
   - Click **Allow Access from Anywhere** (adds `0.0.0.0/0`), or  
   - Add your current IP (e.g. home or office).
3. Click **Confirm**.

If your IP isn’t allowed, Atlas often closes the connection and you see an SSL “internal error”.

## 4. Get the connection string

1. Go to **Database** in the sidebar.
2. Click **Connect** on your cluster.
3. Choose **Drivers** (e.g. Node.js, version 5.5 or later).
4. Copy the connection string. It looks like:
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/
   ```
5. Replace `<username>` with your database username and `<password>` with your database password (URL-encoded if it has special characters).
6. You can add options at the end, e.g.:
   ```text
   mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## 5. Put it in `.env`

In the project root, in your `.env` file, set:

```env
REACT_APP_MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

Use your real username, password (URL-encoded if needed), and cluster host. The backend also reads `MONGODB_URI` or `REACT_APP_MONGO_URI` if you prefer those names.

## 6. Restart the server

Stop the backend (Ctrl+C) and run:

```bash
npm run server
```

You should see **MongoDB connected** in the terminal.

---

## If it still fails

- **Still SSL error:** Ensure **Network Access** includes your IP (or `0.0.0.0/0` for testing).
- **Authentication failed:** Double-check username/password and that the user has database access.
- **Timeout:** Check firewall/VPN; try from another network.
- **Node 24:** If you’re on Node 24, try Node 20 LTS (`nvm use 20` if you use nvm).
