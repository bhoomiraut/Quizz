import os
from pymongo import MongoClient, ASCENDING
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("MONGO_DB_NAME", "quizpriv_db")

if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env")

# Mongo client with connection timeout
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Test connection
    client.admin.command('ping')
    print(f"✅ MongoDB connected successfully to {MONGO_URI}")
    
    # Database
    db = client[DB_NAME]
    
    # ---------------- Collections ----------------
    
    # Stores full cleaned transcript per upload
    transcripts_collection = db["transcripts"]
    
    # Stores question batches generated per transcript chunk
    question_sets_collection = db["question_sets"]
    
    # ---------------- Indexes ----------------
    # These run safely even if indexes already exist
    
    # Fast lookup of transcripts by creation time
    transcripts_collection.create_index(
        [("created_at", ASCENDING)]
    )
    
    # Fast lookup of all question batches for a transcript
    question_sets_collection.create_index(
        [("transcript_id", ASCENDING)]
    )
    
    # Ensure chunk order retrieval
    question_sets_collection.create_index(
        [("transcript_id", ASCENDING), ("chunk_index", ASCENDING)]
    )
    
    print(f"✅ MongoDB indexes created successfully")
    
except Exception as e:
    print(f"⚠️  MongoDB Connection Failed: {str(e)}")
    print(f"⚠️  App will continue without database storage")
    print(f"⚠️  To fix: Ensure MongoDB is running on the correct port")
    
    # Create mock collections that don't save to DB
    class MockCollection:
        def insert_one(self, data):
            class MockResult:
                inserted_id = None
            return MockResult()
    
    transcripts_collection = MockCollection()
    question_sets_collection = MockCollection()
    client = None
    db = None
