import os
import io
import json
import re
import numpy as np
from pathlib import Path
from typing import List, Dict
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from docx import Document

from groq import Groq
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings

from app.db import transcripts_collection, question_sets_collection
from bson import ObjectId

# ---------------- ENV ----------------
# Load .env from server directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = "llama-3.3-70b-versatile"

client = Groq(api_key=GROQ_API_KEY)

# ---------------- APP ----------------
app = FastAPI(title="LangChain Quiz Generator", version="2.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- EMBEDDINGS ----------------
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

SIMILARITY_THRESHOLD = 0.85


# ---------------- PREPROCESSING ----------------
FILLER_PATTERN = r"\b(uh|um|erm|ah|like|you know|basically|actually|literally)\b"
ACK_PATTERN = r"\b(yes|yeah|yep|ok|okay|right|sure|fine|got it|correct)\b"
META_PATTERN = (
    r"can you (see|hear)|let me know if|screen is visible|"
    r"shall we start|any questions before|joining the call|"
    r"please mute|please unmute"
)

def preprocess_text(text: str) -> str:
    """
    Simplified preprocessing using regex patterns.
    Removes timestamps, fillers, acknowledgments, meta-talk, and speaker labels.
    """
    text = text.lower()

    # Remove timestamps
    text = re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\b", " ", text)

    # Remove fillers, acknowledgements, meta talk
    text = re.sub(FILLER_PATTERN, " ", text, flags=re.IGNORECASE)
    text = re.sub(ACK_PATTERN, " ", text, flags=re.IGNORECASE)
    text = re.sub(META_PATTERN, " ", text, flags=re.IGNORECASE)

    # Remove speaker labels
    text = re.sub(r"\b[a-z]+ [a-z]+:\b", " ", text)

    # Normalize spacing
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors."""
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def extract_subtopics(transcript: str) -> List[str]:
    """
    Extract 5-6 high-level subtopics from the transcript using important keywords.
    This is called ONCE per transcript to get dynamic, domain-specific topics.
    """
    prompt = f"""
You are analyzing a transcript to identify key topics.

TASK:
Extract 5–6 high-level subtopics that represent only MAIN concepts discussed.

RULES:
- Use only IMPORTANT KEYWORDS from the transcript
- Short noun phrases (2–5 words)
- No overlap or redundancy
- Domain-specific topics only
- No generic placeholders

Return ONLY a JSON object with a "subtopics" array.

Transcript:
\"\"\"{transcript}\"\"\"
"""

    try:
        print(f"Calling Groq API for subtopic extraction...")
        response = client.chat.completions.create(
            model=MODEL_NAME,
            temperature=0.0,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}]
        )
        
        data = json.loads(response.choices[0].message.content)
        subtopics = data.get("subtopics", [])
        
        if not subtopics:
            print(f"⚠️  No subtopics found in response, using fallback")
            return ["General"]
            
        return subtopics
        
    except Exception as e:
        print(f"⚠️  Subtopic extraction failed: {str(e)}")
        return ["General"]


def classify_subtopic(question_text: str, subtopics: List[str]) -> str:
    """
    Assign the SINGLE BEST subtopic to a question.
    This function is called in parallel for each question.
    Includes retry logic for rate limits.
    """
    prompt = f"""
You are an expert classifier.

TASK:
Assign the SINGLE BEST subtopic to the QUESTION.

RULES:
- Choose ONLY from the list below
- Do NOT invent new subtopics
- Pick the most dominant and relevant concept
- Return ONLY the subtopic text (no explanation)

SUBTOPICS:
{", ".join(subtopics)}

QUESTION:
"{question_text}"

Return ONLY the subtopic text.
"""

    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Add small delay to avoid rate limits
            if attempt > 0:
                time.sleep(2 ** attempt)  # Exponential backoff: 2s, 4s, 8s
            
            response = client.chat.completions.create(
                model=MODEL_NAME,
                temperature=0.0,
                messages=[{"role": "user", "content": prompt}]
            )
            
            classified = response.choices[0].message.content.strip()
            
            # Validate that the returned subtopic is in the list
            if classified in subtopics:
                return classified
            else:
                # Fallback to first subtopic if invalid
                return subtopics[0] if subtopics else "General"
                
        except Exception as e:
            error_str = str(e)
            if "rate_limit" in error_str.lower() and attempt < max_retries - 1:
                # Rate limit hit, wait and retry
                wait_time = 2 ** (attempt + 1)
                time.sleep(wait_time)
                continue
            elif attempt == max_retries - 1:
                # Final attempt failed
                print(f"⚠️  Subtopic classification failed after {max_retries} attempts: {error_str[:100]}")
                return subtopics[0] if subtopics else "General"
    
    return subtopics[0] if subtopics else "General"


def tag_questions_with_subtopics(questions: List[Dict], subtopics: List[str]):
    """
    Assign subtopics to questions in parallel using ThreadPoolExecutor.
    This modifies the questions list in place.
    Uses 3 workers to avoid rate limits.
    """
    print(f"\n{'='*80}")
    print(f"🏷️  SUBTOPIC CLASSIFICATION (PARALLEL)")
    print(f"{'='*80}")
    print(f"Questions to classify: {len(questions)}")
    print(f"Available subtopics: {', '.join(subtopics)}")
    print(f"Using 3 parallel workers (rate limit safe)...\n")
    
    with ThreadPoolExecutor(max_workers=3) as executor:  # Reduced from 8 to 3
        # Submit all classification tasks
        futures = {
            executor.submit(classify_subtopic, q["question"], subtopics): q
            for q in questions
        }
        
        # Process results as they complete
        completed = 0
        for future in as_completed(futures):
            q = futures[future]
            try:
                q["subtopic"] = future.result()
                completed += 1
                if completed % 5 == 0 or completed == len(questions):  # Report every 5 instead of 10
                    print(f"✓ Classified: {completed}/{len(questions)} questions")
            except Exception as e:
                print(f"⚠️  Failed to classify question {q.get('id', '?')}: {str(e)[:100]}")
                q["subtopic"] = "General"
    
    # Validate and normalize
    valid_subtopics = set(subtopics)
    for q in questions:
        if q.get("subtopic") not in valid_subtopics:
            q["subtopic"] = "General"
    
    # Print distribution
    subtopic_counts = {}
    for q in questions:
        subtopic = q.get("subtopic", "General")
        subtopic_counts[subtopic] = subtopic_counts.get(subtopic, 0) + 1
    
    print(f"\n📊 Subtopic Distribution:")
    for subtopic, count in sorted(subtopic_counts.items(), key=lambda x: -x[1]):
        print(f"   {subtopic}: {count} questions")
    print(f"{'='*80}\n")


def build_prompt(chunk: str, start_id: int, max_questions: int = 6) -> str:
    """
    Build high-quality prompt for concept-oriented MCQ generation.
    Optimized for quality over quantity.
    """
    return f"""
You are an expert assessment architect designing high-quality professional exams.

TASK:
From the content below, generate **{max_questions} NON-REDUNDANT, CONCEPT-ORIENTED MCQs**
that test **deep understanding of the CORE SUBJECT MATTER ONLY**.

ABSOLUTE EXCLUSIONS (DO NOT GENERATE QUESTIONS ON):
- Session structure or agenda
- Recordings or availability of recordings
- Introductions, outlines, or closing remarks
- Q&A interactions or audience questions
- Ignore Installations commands, Dependencies and Instructions
- Feedback, reflections, opinions, or evaluations of the session
- Meta commentary about the meeting, presentation, or discussion itself

FOCUS STRICTLY ON:
- Core concepts, principles, and theories
- Mechanisms, workflows, and processes
- Constraints, trade-offs, and implications
- Decision logic and reasoning
- Cause–effect relationships within the main topic

STRICT RULES:
- Questions must be **medium or hard difficulty**
- Questions must be **concept-driven**, not transcript-driven
- DO NOT follow conversation order or chronology
- DO NOT reference speakers, meetings, sessions, or discussions
- DO NOT paraphrase transcript sentences
- EACH question must have **exactly ONE correct answer**
- Options must be **clearly distinct** (no close or overlapping choices)
- All options must remain **topically relevant**, not random distractors

OUTPUT FORMAT:
Return ONLY valid JSON.
Generate JSON ONLY — no explanation, no markdown.

{{
  "questions": [
    {{
      "id": {start_id},
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_options": [0],
      "difficulty": "medium|hard",
      "type": "single"
    }}
  ]
}}

CONTENT (CORE TOPIC SOURCE ONLY):
\"\"\"{chunk}\"\"\"
"""


@app.post("/api/preprocess")
async def preprocess_transcript_endpoint(file: UploadFile = File(...)):
    """Preprocess transcript file - clean and remove filler words"""
    
    # Read file
    ext = Path(file.filename).suffix.lower()
    raw = await file.read()

    if ext == ".docx":
        doc = Document(io.BytesIO(raw))
        text = " ".join(p.text for p in doc.paragraphs)
    else:
        text = raw.decode("utf-8", errors="ignore")

    original_length = len(text)
    cleaned_text = preprocess_text(text)
    cleaned_length = len(cleaned_text)

    return JSONResponse({
        "cleaned_transcript": cleaned_text,
        "stats": {
            "original_length": original_length,
            "cleaned_length": cleaned_length,
            "reduction_percent": round((1 - cleaned_length / original_length) * 100, 2) if original_length > 0 else 0
        }
    })


@app.post("/api/generate-questions")
async def generate_questions(
    file: UploadFile = File(...),
    question_type: str = "single",
    num_options: int = 4,
    num_questions: int = 40,
    difficulty: str = "medium"
) -> JSONResponse:
    """
    Generate questions using LangChain text splitting and embeddings for deduplication.
    """
    ext = Path(file.filename).suffix.lower()

    if ext not in [".txt", ".docx"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only .txt and .docx are allowed.",
        )

    try:
        # Read file
        raw = await file.read()

        if ext == ".docx":
            doc = Document(io.BytesIO(raw))
            text = " ".join(p.text for p in doc.paragraphs)
        else:
            text = raw.decode("utf-8", errors="ignore")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    # Preprocess text
    original_length = len(text)
    transcript_text = preprocess_text(text)
    cleaned_length = len(transcript_text)

    if not transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty after preprocessing.")

    # ---------------- SAVE TRANSCRIPT TO MONGODB ----------------
    print(f"\n{'='*80}")
    print(f"📝 TRANSCRIPT UPLOAD INITIATED")
    print(f"{'='*80}")
    print(f"📄 Filename: {file.filename}")
    print(f"📊 Original Length: {original_length:,} characters")
    print(f"✂️  Cleaned Length: {cleaned_length:,} characters")
    print(f"📉 Reduction: {round((1 - cleaned_length / original_length) * 100, 2)}%")
    print(f"{'='*80}\n")

    try:
        transcript_id = transcripts_collection.insert_one({
            "filename": file.filename,
            "content": transcript_text,
            "original_length": original_length,
            "cleaned_length": cleaned_length,
            "created_at": datetime.utcnow()
        }).inserted_id
        print(f"✅ Transcript saved to MongoDB with ID: {transcript_id}\n")
        
        # Delete old question sets to keep only the latest
        try:
            deleted_result = question_sets_collection.delete_many({})
            if deleted_result.deleted_count > 0:
                print(f"🗑️  Deleted {deleted_result.deleted_count} old question set(s) from MongoDB")
                print(f"   Keeping only the latest generation\n")
        except Exception as del_error:
            print(f"⚠️  Warning: Failed to delete old question sets - {str(del_error)}\n")
            
    except Exception as db_error:
        print(f"⚠️  MongoDB Warning: Failed to save transcript - {str(db_error)}")
        print(f"⚠️  Continuing without database storage...\n")
        transcript_id = None

    # ---------------- STEP 1: EXTRACT SUBTOPICS (ONCE) ----------------
    print(f"{'='*80}")
    print(f"📋 EXTRACTING SUBTOPICS FROM TRANSCRIPT")
    print(f"{'='*80}")
    print(f"Calling Groq API to identify 5-10 main topics...\n")
    
    dynamic_subtopics = extract_subtopics(transcript_text[:10000])  # Use first 10k chars for speed
    
    print(f"✅ Extracted {len(dynamic_subtopics)} subtopics:")
    for i, subtopic in enumerate(dynamic_subtopics, 1):
        print(f"   {i}. {subtopic}")
    print(f"{'='*80}\n")

    # ---------------- LANGCHAIN TEXT SPLITTING ----------------
    print(f"{'='*80}")
    print(f"🔪 LANGCHAIN TEXT SPLITTING")
    print(f"{'='*80}")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=10000,
        chunk_overlap=300,
        separators=["\n\n", ".", " "]
    )

    chunks = text_splitter.split_text(transcript_text)
    
    print(f"Text split into {len(chunks)} chunks")
    print(f"Chunk size: 10000 chars | Overlap: 400 chars")
    print(f"Target questions: {num_questions} total")
    print(f"Difficulty: {difficulty} | Options: {num_options} | Type: {question_type}")
    print(f"Mode: Quality-focused with per-question deduplication\n")
    
    all_embeddings = []
    all_questions = []
    global_q_id = 1
    failed_chunks = []
    successful_chunks = 0

    # ---------------- PROCESS CHUNKS ----------------
    for idx, chunk in enumerate(chunks):
        # Stop if we already have enough questions
        if len(all_questions) >= num_questions:
            print(f"\n[Chunk {idx + 1}] Target reached, stopping early.")
            break
            
        print(f"\n[Chunk {idx + 1}/{len(chunks)}] Processing chunk (size: {len(chunk)} chars)...")
        
        try:
            # Build prompt for this chunk
            prompt = build_prompt(chunk, global_q_id, max_questions=6)

            # Call Groq API
            try:
                print(f"[Chunk {idx + 1}] Calling Groq API...")
                response = client.chat.completions.create(
                    model=MODEL_NAME,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": "Return JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                )
                print(f"[Chunk {idx + 1}] ✓ API call successful")
            except Exception as api_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"API Error: {str(api_error)}"
                })
                print(f"[Chunk {idx + 1}] ✗ FAILED - API Error: {str(api_error)}")
                continue

            # Parse JSON response
            try:
                print(f"[Chunk {idx + 1}] Parsing JSON response...")
                data = json.loads(response.choices[0].message.content)
                questions = data.get("questions", [])
                print(f"[Chunk {idx + 1}] ✓ JSON parsed - {len(questions)} questions extracted")
            except (json.JSONDecodeError, KeyError, IndexError) as parse_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"JSON Parse Error: {str(parse_error)}"
                })
                print(f"[Chunk {idx + 1}] ✗ FAILED - JSON Parse Error: {str(parse_error)}")
                continue

            # Fix IDs sequentially
            for q in questions:
                q["id"] = global_q_id
                global_q_id += 1

            # ---------------- EMBEDDINGS CHECK ----------------
            try:
                print(f"[Chunk {idx + 1}] Generating embeddings for {len(questions)} questions...")
                new_texts = [q["question"] for q in questions]
                new_embeddings = embeddings.embed_documents(new_texts)
                print(f"[Chunk {idx + 1}] ✓ Embeddings generated")

                if all_embeddings:
                    similarities = [
                        max(cosine_similarity(e, prev) for prev in all_embeddings)
                        for e in new_embeddings
                    ]
                    mean_similarity = np.mean(similarities)
                    print(f"[Chunk {idx + 1}] Similarity check: mean={mean_similarity:.4f}, threshold={SIMILARITY_THRESHOLD}")
                    if mean_similarity > SIMILARITY_THRESHOLD:
                        print(f"[Chunk {idx + 1}] High similarity detected - stopping generation")
                        break

                all_embeddings.extend(new_embeddings)
                all_questions.extend(questions)
                successful_chunks += 1
            except Exception as embedding_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"Embedding Error: {str(embedding_error)}"
                })
                print(f"[Chunk {idx + 1}] ✗ FAILED - Embedding Error: {str(embedding_error)}")
                continue

            # -------- SAVE BATCH --------
            try:
                print(f"[Chunk {idx + 1}] Saving to database...")
                question_sets_collection.insert_one({
                    "transcript_id": transcript_id,
                    "chunk_index": idx,
                    "questions": questions,
                    "created_at": datetime.utcnow()
                })
                print(f"[Chunk {idx + 1}] ✓ SUCCESS - Chunk processed ({len(questions)} questions added)")
            except Exception as db_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"Database Error: {str(db_error)}"
                })
                print(f"[Chunk {idx + 1}] ✗ FAILED - Database Error: {str(db_error)}")
                continue

        except Exception as general_error:
            failed_chunks.append({
                "chunk_index": idx,
                "error": f"Unexpected Error: {str(general_error)}"
            })
            print(f"[Chunk {idx + 1}] ✗ FAILED - Unexpected Error: {str(general_error)}")
            continue

    # ---------------- SUMMARY ----------------
    print(f"\n{'='*60}")
    print(f"Generation Complete Summary:")
    print(f"  Total Chunks: {len(chunks)}")
    print(f"  Successfully Processed: {successful_chunks}")
    print(f"  Failed Chunks: {len(failed_chunks)}")
    print(f"  Total Questions Generated: {len(all_questions)}")
    if failed_chunks:
        print(f"  Failed Chunk Indices: {[fc['chunk_index'] for fc in failed_chunks]}")
    print(f"{'='*60}\n")
    
    # ---------------- STEP 3: ASSIGN SUBTOPICS (PARALLEL) ----------------
    if all_questions and dynamic_subtopics:
        tag_questions_with_subtopics(all_questions, dynamic_subtopics)
    
    # ---------------- SAVE CONSOLIDATED QUESTIONS TO MONGODB ----------------
    consolidated_question_set_id = None
    if transcript_id and all_questions:
        try:
            print(f"💾 Saving consolidated question set to MongoDB...")
            result = question_sets_collection.insert_one({
                "transcript_id": transcript_id,
                "chunk_index": -1,
                "is_consolidated": True,
                "subtopics": dynamic_subtopics,
                "questions": all_questions,
                "num_questions": len(all_questions),
                "total_chunks_processed": successful_chunks,
                "difficulty": difficulty,
                "question_type": question_type,
                "num_options": num_options,
                "created_at": datetime.utcnow()
            })
            consolidated_question_set_id = result.inserted_id
            print(f"✅ Consolidated questions saved (doc_id: {consolidated_question_set_id})")
        except Exception as db_error:
            print(f"⚠️  Failed to save consolidated questions: {str(db_error)}")

    return JSONResponse(content={
        "transcript_id": str(transcript_id) if transcript_id else None,
        "total_questions": len(all_questions),
        "questions": all_questions,
        "subtopics": dynamic_subtopics,
        "total_chunks": len(chunks),
        "processed_chunks": successful_chunks,
        "failed_chunks": failed_chunks,
        "success": len(all_questions) > 0
    })


@app.get("/api/question-sets")
async def get_question_sets() -> JSONResponse:
    """
    Fetch all consolidated question sets from MongoDB.
    Returns question sets grouped by transcript with subtopics.
    """
    try:
        # Fetch only consolidated question sets (is_consolidated=True)
        cursor = question_sets_collection.find(
            {"is_consolidated": True}
        ).sort("created_at", -1)  # Most recent first
        
        question_sets = []
        
        for doc in cursor:
            # Convert ObjectId to string for JSON serialization
            doc['_id'] = str(doc['_id'])
            if 'transcript_id' in doc and isinstance(doc['transcript_id'], ObjectId):
                doc['transcript_id'] = str(doc['transcript_id'])
            
            # Ensure created_at is string
            if 'created_at' in doc:
                doc['created_at'] = doc['created_at'].isoformat() if hasattr(doc['created_at'], 'isoformat') else str(doc['created_at'])
            
            question_sets.append(doc)
        
        print(f"\n📊 Fetched {len(question_sets)} question sets from MongoDB")
        
        return JSONResponse(content={
            "success": True,
            "question_sets": question_sets,
            "total": len(question_sets)
        })
        
    except Exception as e:
        print(f"❌ Error fetching question sets: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch question sets: {str(e)}"
        )


@app.get("/api/question-sets/{transcript_id}")
async def get_question_set_by_transcript(transcript_id: str) -> JSONResponse:
    """
    Fetch question sets for a specific transcript.
    """
    try:
        # Convert string to ObjectId
        try:
            transcript_obj_id = ObjectId(transcript_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid transcript ID format")
        
        # Find consolidated question set for this transcript
        doc = question_sets_collection.find_one({
            "transcript_id": transcript_obj_id,
            "is_consolidated": True
        })
        
        if not doc:
            raise HTTPException(
                status_code=404,
                detail=f"No question set found for transcript {transcript_id}"
            )
        
        # Convert ObjectIds to strings
        doc['_id'] = str(doc['_id'])
        doc['transcript_id'] = str(doc['transcript_id'])
        
        if 'created_at' in doc:
            doc['created_at'] = doc['created_at'].isoformat() if hasattr(doc['created_at'], 'isoformat') else str(doc['created_at'])
        
        return JSONResponse(content={
            "success": True,
            "question_set": doc
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error fetching question set: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch question set: {str(e)}"
        )
