# MongoDB Connection Guide

## 🔍 Finding Your MongoDB Port

Port 27015 is not running MongoDB. Here's how to find and connect:

### Step 1: Find MongoDB Service

Open PowerShell as Administrator and run:
```powershell
# Check if MongoDB service is running
Get-Service -Name "*mongo*"

# Or find MongoDB process
Get-Process -Name "mongod*"
```

### Step 2: Check MongoDB Port

The default MongoDB port is **27017**. Try these commands:

```powershell
# Check if port 27017 is listening
Test-NetConnection -ComputerName localhost -Port 27017

# Or check with netstat
netstat -ano | findstr "27017"
```

### Step 3: Start MongoDB

If MongoDB is not running:

```powershell
# Start MongoDB service
net start MongoDB

# Or if you have MongoDB installed elsewhere:
# Navigate to MongoDB bin folder and run:
mongod --dbpath="C:\data\db"
```

## 🔧 Update Your Connection

### Option 1: Use Default Port (27017)

Update your `.env` file:
```env
MONGO_URI=mongodb://localhost:27017/
MONGO_DB_NAME=myquiz_db
```

### Option 2: Run Without MongoDB

The app now works without MongoDB! Just keep the current settings and it will:
- ✅ Continue generating questions
- ✅ Return all questions in the response  
- ⚠️  Skip database storage

## 📊 Connecting with MongoDB Compass

### Step 1: Open MongoDB Compass

### Step 2: Connection String

Use one of these connection strings:

**Default Local:**
```
mongodb://localhost:27017
```

**If you have authentication:**
```
mongodb://username:password@localhost:27017
```

**If using custom port:**
```
mongodb://localhost:YOUR_PORT
```

### Step 3: Connect

1. Paste connection string in the "New Connection" field
2. Click "Connect"
3. You should see your databases listed

### Step 4: Find Your Data

1. Look for database: `myquiz_db`
2. Inside you'll find collections:
   - `transcripts` - uploaded files
   - `question_sets` - generated questions

## 🎯 Quick Fix

The easiest solution:

1. **Update `.env` to use default MongoDB port:**
```env
MONGO_URI=mongodb://localhost:27017/
```

2. **Or disable MongoDB temporarily:**
   - Comment out MongoDB lines in `.env`
   - App will work without database

3. **Restart server:**
```powershell
# Your backend will restart automatically with uvicorn --reload
```

## ✅ Verify Connection

After updating `.env`, check the terminal output:
- ✅ Should see: "MongoDB connected successfully"
- ✅ Should see: "MongoDB indexes created successfully"
- ❌ If you see warnings, MongoDB is not connected (but app still works)

## 📝 Current Status

Your app is running with MongoDB disabled. It will:
- ✅ Accept file uploads
- ✅ Generate questions
- ✅ Return results
- ⚠️  Not save to database

To enable database storage, ensure MongoDB is running on the correct port!
