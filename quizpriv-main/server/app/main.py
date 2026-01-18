import os
from pathlib import Path
from dotenv import load_dotenv

# ---------------- 1. LOAD ENV FIRST (CRITICAL FOR LANGSMITH EU) ----------------
# This must happen BEFORE importing langsmith or langchain
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Verify LangSmith EU endpoint configuration
print(f"LangSmith Configuration:")
print(f"   - Endpoint: {os.getenv('LANGCHAIN_ENDPOINT', 'Not Set')}")
print(f"   - Project:  {os.getenv('LANGCHAIN_PROJECT', 'Not Set')}")
print(f"   - Tracing:  {os.getenv('LANGCHAIN_TRACING_V2', 'Not Set')}")

# ---------------- 2. IMPORTS ----------------
import io
import json
import re
from typing import List, Dict
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from docx import Document

from groq import Groq
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langsmith import traceable, Client as LangSmithClient
from fuzzywuzzy import fuzz

from app.db import transcripts_collection, question_sets_collection
from bson import ObjectId

# ---------------- CONFIGURATION ----------------
from app.config import (
    GROQ_MODEL_NAME,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    SINGLE_CORRECT_MULTIPLIER,
    MULTIPLE_CORRECT_MULTIPLIER,
    MAX_REGENERATION_RETRIES,
    REGENERATION_BATCH_SIZE,
    MIN_QUESTION_LENGTH,
    MAX_QUESTION_LENGTH,
    MIN_CORRECT_OPTIONS,
    MAX_CORRECT_OPTIONS,
    MAX_KEYWORDS_PER_CHUNK,
    TOP_KEYWORDS_COUNT,
    CLASSIFICATION_WORKERS,
    LENGTH_WEIGHT,
    DIFFICULTY_WEIGHT,
    OPTION_QUALITY_WEIGHT,
    DISTRACTOR_WEIGHT,
)

# ---------------- CONFIG ----------------
MAX_TOTAL_REGEN_CALLS = 5  # Hard cap on total regeneration API calls

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = GROQ_MODEL_NAME

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


def fuzzy_similarity(a: str, b: str) -> float:
    """
    Fast semantic-ish similarity using fuzzy matching.
    Returns value between 0 and 1.
    """
    return fuzz.token_set_ratio(a, b) / 100.0


def is_valid_question(q: Dict, expected_options: int = 4, question_type: str = "single") -> bool:
    """
    Hard validation gate for question quality.
    Rejects junk, malformed, or placeholder MCQs.
    """
    # Must have required fields
    if not q.get("question") or not q.get("options"):
        return False

    # Enforce option count
    if len(q["options"]) != expected_options:
        return False
    
    # Reject duplicate options to ensure question quality
    if len(set(q["options"])) != len(q["options"]):
        return False
    
    # Validate that all options are strings
    if not all(isinstance(o, str) for o in q["options"]):
        return False
    
    # Enforce valid difficulty levels
    if q.get("difficulty") not in {"easy", "medium", "hard"}:
        return False

    # Validate correct_options based on question type
    correct_options = q.get("correct_options", [])
    if not correct_options:
        return False
    
    if question_type == "single":
        # Single correct: must have exactly 1 correct answer
        if len(correct_options) != 1:
            return False
    elif question_type == "multiple":
        # Multiple correct: allow 2-4 correct answers (more flexible, better LLM success rate)
        if len(correct_options) < MIN_CORRECT_OPTIONS or len(correct_options) > MAX_CORRECT_OPTIONS:
            return False
    
    # Validate correct_options indices are within range
    for idx in correct_options:
        if idx < 0 or idx >= expected_options:
            return False

    # Reject placeholder / junk options
    for opt in q["options"]:
        opt_clean = str(opt).strip().lower()
        if len(opt_clean) < 5:
            return False
        if opt_clean in {"a", "b", "c", "d", "1", "2", "3", "4"}:
            return False

    # Question length sanity
    q_len = len(q["question"])
    if q_len < MIN_QUESTION_LENGTH or q_len > MAX_QUESTION_LENGTH:
        return False

    return True


def extract_chunk_keywords(chunk: str, max_keywords: int = MAX_KEYWORDS_PER_CHUNK) -> List[str]:
    """
    Extract important keywords from chunk using frequency analysis.
    No LLM needed - fast and cheap.
    """
    words = re.findall(r"[a-zA-Z]{4,}", chunk.lower())
    stopwords = {
        "this", "that", "with", "from", "have", "will", "your", "about",
        "which", "their", "there", "where", "when", "what", "would",
        "said", "like", "just", "know", "think", "going", "really",
        "want", "need", "make", "also", "much", "well", "some", "been"
    }

    freq = {}
    for w in words:
        if w not in stopwords:
            freq[w] = freq.get(w, 0) + 1

    # Return top keywords by frequency
    return sorted(freq, key=freq.get, reverse=True)[:max_keywords]


@traceable(name="extract_subtopics", run_type="chain")
def extract_subtopics(keywords_or_transcript: str, is_keywords: bool = False) -> List[str]:
    """
    Extract 5-6 high-level subtopics from the transcript using important keywords.
    This is called ONCE per transcript to get dynamic, domain-specific topics.
    """
    if is_keywords:
        prompt = f"""
You are analyzing keywords extracted from a transcript to identify main topics.

TASK:
Extract 5–6 high-level subtopics that represent only MAIN concepts discussed.

RULES:
- Use only IMPORTANT KEYWORDS provided
- Short noun phrases (2–5 words)
- No overlap or redundancy
- Domain-specific topics only
- No generic placeholders

Return ONLY a JSON object with a "subtopics" array.

Keywords:
\"\"\"{keywords_or_transcript}\"\"\"
"""
    else:
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
\"\"\"{keywords_or_transcript}\"\"\"
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
            print(f"No subtopics found in response, using fallback")
            return ["General"]
            
        return subtopics
        
    except Exception as e:
        print(f"Subtopic extraction failed: {str(e)}")
        return ["General"]


@traceable(name="classify_subtopic", run_type="chain")
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
                print(f"Subtopic classification failed after {max_retries} attempts: {error_str[:100]}")
                return subtopics[0] if subtopics else "General"
    
    return subtopics[0] if subtopics else "General"


def tag_questions_with_subtopics(questions: List[Dict], subtopics: List[str]):
    """
    Assign subtopics to questions in parallel using ThreadPoolExecutor.
    This modifies the questions list in place.
    Uses 3 workers to avoid rate limits.
    """
    print(f"\n{'='*80}")
    print(f"SUBTOPIC CLASSIFICATION (PARALLEL)")
    print(f"{'='*80}")
    print(f"Questions to classify: {len(questions)}")
    print(f"Available subtopics: {', '.join(subtopics)}")
    print(f"Using {CLASSIFICATION_WORKERS} parallel workers (rate limit safe)...\n")
    
    with ThreadPoolExecutor(max_workers=CLASSIFICATION_WORKERS) as executor:
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
                    print(f"Classified: {completed}/{len(questions)} questions")
            except Exception as e:
                print(f"Failed to classify question {q.get('id', '?')}: {str(e)[:100]}")
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
    
    print(f"\nSubtopic Distribution:")
    for subtopic, count in sorted(subtopic_counts.items(), key=lambda x: -x[1]):
        print(f"   {subtopic}: {count} questions")
    print(f"{'='*80}\n")


def calculate_question_quality_score(
    question: Dict,
    all_questions: List[Dict]
) -> float:
    """
    Calculate quality score for a question (0-100).
    Uses fuzzy matching instead of embeddings.
    """
    score = 0.0
    question_text = question["question"]

    # ---------- 1. DIVERSITY (FUZZY) ----------
    if all_questions:
        sims = [
            fuzzy_similarity(question_text, q["question"])
            for q in all_questions
            if q["question"] != question_text
        ]
        # Calculate diversity score from top 5 most similar questions
        top_sims = sorted(sims, reverse=True)[:5]
        avg_sim = sum(top_sims) / max(1, len(top_sims)) if top_sims else 0
        diversity = 1 - avg_sim
        score += diversity * 40  # same weight as before
    else:
        score += 40

    # ---------- 2. QUESTION LENGTH ----------
    q_len = len(question_text)
    if 60 <= q_len <= 150:
        score += 20
    elif 40 <= q_len <= 200:
        score += 15
    else:
        score += 8

    # ---------- 3. DIFFICULTY ----------
    diff = question.get("difficulty", "medium")
    score += 20 if diff == "hard" else 15 if diff == "medium" else 10

    # ---------- 4. OPTION QUALITY ----------
    options = question.get("options", [])
    if len(options) == 4:
        overlaps = []
        for i in range(4):
            for j in range(i + 1, 4):
                overlaps.append(fuzz.token_sort_ratio(options[i], options[j]))

        max_overlap = max(overlaps) if overlaps else 0
        if max_overlap < 80:
            score += 20
        elif max_overlap < 90:
            score += 10
        else:
            score -= 5  # bad options

    return round(score, 2)


def enforce_type_ratio(questions: List[Dict], target_single: int, target_multiple: int) -> List[Dict]:
    """
    Enforce exact type ratio for mixed mode.
    Ensures the final question set has exactly the requested single/multiple split.
    """
    singles = [q for q in questions if q.get("type") == "single"]
    multiples = [q for q in questions if q.get("type") == "multiple"]
    
    final = []
    
    # Take exact counts from each type
    final.extend(singles[:target_single])
    final.extend(multiples[:target_multiple])
    
    # Backfill if short (never drop below target total)
    target_total = target_single + target_multiple
    if len(final) < target_total:
        remaining = [q for q in questions if q not in final]
        final.extend(remaining[: (target_total - len(final))])
    
    return final[:target_total]


def select_best_questions(all_questions: List[Dict], target_count: int) -> List[Dict]:
    """
    Select EXACTLY target_count questions using fuzzy matching.
    Quality-first, but NEVER underflows.
    """
    if len(all_questions) <= target_count:
        return all_questions

    print(f"\n{'='*80}")
    print("SELECTING BEST {target_count} QUESTIONS")
    print(f"{'='*80}")
    print(f"Generated {len(all_questions)} questions (target: {target_count})")

    scored = []
    for q in all_questions:
        score = calculate_question_quality_score(q, all_questions)
        scored.append((score, q))

    scored.sort(key=lambda x: x[0], reverse=True)

    selected = []
    for score, q in scored:
        if len(selected) >= target_count:
            break

        # fuzzy duplicate check
        if any(
            fuzzy_similarity(q["question"], s["question"]) > 0.85
            for s in selected
        ):
            continue

        selected.append(q)

    # HARD BACKFILL
    if len(selected) < target_count:
        for _, q in scored:
            if q not in selected:
                selected.append(q)
            if len(selected) >= target_count:
                break

    print(f"Final question count: {len(selected[:target_count])}")
    print(f"{'='*80}\n")

    return selected[:target_count]


def build_prompt(chunk: str, start_id: int, max_questions: int = 6, question_type: str = "single", difficulty: str = "medium") -> str:
    """
    Build high-quality prompt for concept-oriented MCQ generation.
    Optimized for quality over quantity.
    Supports single correct, multiple correct, and mixed question types.
    """
    
    # Determine correct answer count instruction and example format
    if question_type == "single":
        correct_answer_instruction = "- EACH question must have **exactly ONE correct answer**"
        type_description = "single-correct-answer"
        example_format = '''
{
  "questions": [
    {
      "id": ''' + str(start_id) + ''',
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_options": [0],
      "difficulty": "''' + difficulty.lower() + '''",
      "type": "single"
    }
  ]
}'''
    elif question_type == "multiple":
        # PRODUCTION-GRADE MULTIPLE-CORRECT PROMPT
        return f"""You are an expert assessment architect designing professional MULTIPLE-CORRECT MCQs
used in enterprise certification exams.

CRITICAL REQUIREMENT (MANDATORY):
- EACH question MUST have **2 to 4 correct options**
- Single-correct questions are INVALID and will be REJECTED
- correct_options MUST contain 2–4 indices (e.g. [0,2] or [1,2,3])

TASK:
From the content below, generate **{max_questions} NON-REDUNDANT MULTIPLE-CORRECT MCQs**.

QUESTION STYLE (MANDATORY):
- Frame questions as:
  - "Which of the following are correct?"
  - "Select ALL statements that apply"
  - "Which statements are true regarding ..."
- DO NOT ask "best answer" or "most appropriate" questions

COGNITIVE DEPTH REQUIREMENTS:
- Test understanding of **concepts, mechanisms, implications, or constraints**
- Avoid surface-level definitions or recall
- Prefer WHY, WHAT-IF, FAILURE-MODE, or CONSEQUENCE-based questions

STRICT OPTION RULES:
- Each correct option must be **independently true**
- No correct option should depend on another to be correct
- Incorrect options must be **plausible but false**
- Avoid obvious or joke distractors
- Do NOT include "all of the above" or "none of the above"

VALIDATION BEFORE FINALIZING EACH QUESTION:
- Verify at least **2 correct options** (2, 3, or 4 correct options allowed)
- Verify all correct options are factually correct
- Verify incorrect options are clearly false
- Verify options are semantically distinct

ABSOLUTE EXCLUSIONS:
- Session structure, agenda, recordings
- Introductions or closing remarks
- Q&A interactions or audience questions
- Meta commentary about the meeting or presentation
- Installation steps or command instructions

DIFFICULTY:
- {difficulty.capitalize()} level questions ONLY

OUTPUT FORMAT (JSON ONLY — NO EXPLANATION):

{{
  "questions": [
    {{
      "id": {start_id},
      "question": "Which of the following are correct regarding …?",
      "options": ["A", "B", "C", "D"],
      "correct_options": [0, 2],
      "difficulty": "{difficulty.lower()}",
      "type": "multiple"
    }}
  ]
}}

CONTENT SOURCE:
\"\"\"{chunk}\"\"\"
"""
    else:  # should not reach here in normal flow
        correct_answer_instruction = "- EACH question must have **exactly ONE correct answer**"
        type_description = "single-correct-answer"
        example_format = '''
{
  "questions": [
    {
      "id": ''' + str(start_id) + ''',
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_options": [0],
      "difficulty": "''' + difficulty.lower() + '''",
      "type": "single"
    }
  ]
}'''
    
    return f"""
You are an expert assessment architect designing high-quality professional exams.

TASK:
From the content below, generate **{max_questions} NON-REDUNDANT, CONCEPT-ORIENTED MCQs**
that test **deep understanding of the CORE SUBJECT MATTER ONLY**.

QUESTION TYPE: {type_description}

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
- Questions must be **{difficulty.lower()} difficulty**
- Questions must be **concept-driven**, not transcript-driven
- Prefer WHY, WHAT-IF, FAILURE MODE, or TRADE-OFF questions
- Avoid pure definition or memorization questions
- DO NOT follow conversation order or chronology
- DO NOT reference speakers, meetings, sessions, or discussions
- DO NOT paraphrase transcript sentences
{correct_answer_instruction}
- Options must be **clearly distinct** (no close or overlapping choices)
- All options must remain **topically relevant**, not random distractors

OUTPUT FORMAT:
Return ONLY valid JSON.
Generate JSON ONLY — no explanation, no markdown.
{example_format}

CONTENT (CORE TOPIC SOURCE ONLY):
\"\"\"{chunk}\"\"\"
"""


@traceable(name="generate_questions_chunk", run_type="llm")
def generate_questions_with_llm(prompt: str):
    """
    Helper function to wrap the Groq API call for LangSmith tracing.
    Traces all question generation calls to LangSmith for observability.
    """
    return client.chat.completions.create(
        model=MODEL_NAME,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Return JSON only."},
            {"role": "user", "content": prompt},
        ],
    )


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

    # Calculate original stats
    original_length = len(text)
    original_lines = len([line for line in text.split('\n') if line.strip()])
    original_words = len(text.split())
    
    # Preprocess
    cleaned_text = preprocess_text(text)
    
    # Calculate cleaned stats
    cleaned_length = len(cleaned_text)
    cleaned_lines = len([line for line in cleaned_text.split('\n') if line.strip()])
    cleaned_words = len(cleaned_text.split())
    
    # Calculate reduction percentages
    lines_removed_percent = round((1 - cleaned_lines / original_lines) * 100, 2) if original_lines > 0 else 0
    words_removed_percent = round((1 - cleaned_words / original_words) * 100, 2) if original_words > 0 else 0
    chars_removed_percent = round((1 - cleaned_length / original_length) * 100, 2) if original_length > 0 else 0
    
    # Calculate actual counts removed
    lines_removed = original_lines - cleaned_lines
    words_removed = original_words - cleaned_words

    return JSONResponse({
        "cleaned_transcript": cleaned_text,
        "stats": {
            "original_length": original_length,
            "cleaned_length": cleaned_length,
            "original_lines": original_lines,
            "cleaned_lines": cleaned_lines,
            "original_words": original_words,
            "cleaned_words": cleaned_words,
            "reduction_percent": chars_removed_percent,
            "lines_removed_percent": lines_removed_percent,
            "words_removed_percent": words_removed_percent,
            "lines_removed": lines_removed,
            "words_removed": words_removed,
            "line_reduction_percent": lines_removed_percent,
            "word_reduction_percent": words_removed_percent
        }
    })


@app.post("/api/generate-questions")
async def generate_questions(
    file: UploadFile = File(...),
    question_type: str = "single",
    num_options: int = 4,
    num_questions: int = 40,
    difficulty: str = "medium",
    single_correct_percentage: int = 50
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

    # Preprocess text with detailed stats
    original_length = len(text)
    original_lines = len([line for line in text.split('\n') if line.strip()])
    original_words = len(text.split())
    
    transcript_text = preprocess_text(text)
    
    cleaned_length = len(transcript_text)
    cleaned_lines = len([line for line in transcript_text.split('\n') if line.strip()])
    cleaned_words = len(transcript_text.split())
    
    # Calculate reduction percentages
    lines_removed_percent = round((1 - cleaned_lines / original_lines) * 100, 2) if original_lines > 0 else 0
    words_removed_percent = round((1 - cleaned_words / original_words) * 100, 2) if original_words > 0 else 0
    chars_removed_percent = round((1 - cleaned_length / original_length) * 100, 2) if original_length > 0 else 0

    if not transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty after preprocessing.")

    # ---------------- SAVE TRANSCRIPT TO MONGODB ----------------
    print(f"\n{'='*80}")
    print(f"TRANSCRIPT UPLOAD INITIATED")
    print(f"{'='*80}")
    print(f"Filename: {file.filename}")
    print(f"Original: {original_length:,} chars, {original_lines:,} lines, {original_words:,} words")
    print(f"Cleaned: {cleaned_length:,} chars, {cleaned_lines:,} lines, {cleaned_words:,} words")
    print(f"Reduction: {chars_removed_percent}% chars, {lines_removed_percent}% lines, {words_removed_percent}% words")
    print(f"{'='*80}\n")

    try:
        transcript_id = transcripts_collection.insert_one({
            "filename": file.filename,
            "content": transcript_text,
            "original_length": original_length,
            "cleaned_length": cleaned_length,
            "original_lines": original_lines,
            "cleaned_lines": cleaned_lines,
            "original_words": original_words,
            "cleaned_words": cleaned_words,
            "preprocessing_stats": {
                "chars_removed_percent": chars_removed_percent,
                "lines_removed_percent": lines_removed_percent,
                "words_removed_percent": words_removed_percent
            },
            "created_at": datetime.utcnow()
        }).inserted_id
        print(f"Transcript saved to MongoDB with ID: {transcript_id}\n")
        
        # Clean up old consolidated sets while preserving validated history
        try:
            deleted_result = question_sets_collection.delete_many({
                "is_consolidated": True
            })
            if deleted_result.deleted_count > 0:
                print(f"Deleted {deleted_result.deleted_count} old consolidated set(s) from MongoDB")
                print(f"   Keeping validated history intact\n")
        except Exception as del_error:
            print(f"Warning: Failed to delete old question sets - {str(del_error)}\n")
            
    except Exception as db_error:
        print(f"MongoDB Warning: Failed to save transcript - {str(db_error)}")
        print(f"Continuing without database storage...\n")
        transcript_id = None

    # ---------------- LANGCHAIN TEXT SPLITTING ----------------
    print(f"{'='*80}")
    print(f"LANGCHAIN TEXT SPLITTING")
    print(f"{'='*80}")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", ".", " "]
    )

    chunks = text_splitter.split_text(transcript_text)
    
    # Validate transcript is long enough to process
    if not chunks:
        raise HTTPException(status_code=400, detail="Transcript too short to generate questions")
    
    print(f"Text split into {len(chunks)} chunks")
    print(f"Chunk size: 10000 chars | Overlap: 300 chars")
    print(f"Target questions: {num_questions} total")
    print(f"Difficulty: {difficulty} | Options: {num_options} | Type: {question_type}")
    print(f"Mode: Quality-focused with keyword-based subtopics\n")
    
    # ---------------- STEP 1: EXTRACT KEYWORDS FROM ALL CHUNKS ----------------
    print(f"{'='*80}")
    print(f"EXTRACTING KEYWORDS FROM ALL CHUNKS")
    print(f"{'='*80}")
    
    all_keywords = []
    for idx, chunk in enumerate(chunks):
        keywords = extract_chunk_keywords(chunk)
        all_keywords.extend(keywords)
        print(f"[Chunk {idx + 1}/{len(chunks)}] Keywords: {', '.join(keywords[:5])}...")
    
    # Deduplicate and get top keywords
    keyword_freq = {}
    for kw in all_keywords:
        keyword_freq[kw] = keyword_freq.get(kw, 0) + 1
    
    top_keywords = sorted(keyword_freq, key=keyword_freq.get, reverse=True)[:TOP_KEYWORDS_COUNT]
    keywords_str = ", ".join(top_keywords)
    
    print(f"\nExtracted {len(top_keywords)} unique keywords across all chunks")
    print(f"Top keywords: {keywords_str[:100]}...\n")
    
    # ---------------- STEP 2: EXTRACT SUBTOPICS FROM KEYWORDS ----------------
    print(f"{'='*80}")
    print(f"EXTRACTING SUBTOPICS FROM KEYWORDS")
    print(f"{'='*80}")
    print(f"Calling Groq API to identify 5-6 main topics from keywords...\n")
    
    dynamic_subtopics = extract_subtopics(keywords_str, is_keywords=True)
    
    print(f"Extracted {len(dynamic_subtopics)} subtopics:")
    for i, subtopic in enumerate(dynamic_subtopics, 1):
        print(f"   {i}. {subtopic}")
    print(f"{'='*80}\n")
    
    # ---------------- STEP 3: CALCULATE DYNAMIC ALLOCATION ----------------
    target = num_questions
    base_per_chunk = target // len(chunks)
    remainder = target % len(chunks)
    
    # Calculate single vs multiple split for mixed mode
    if question_type == "mixed":
        single_count = round(target * single_correct_percentage / 100)
        multiple_count = target - single_count
        print(f"\n{'='*80}")
        print(f"MIXED MODE ALLOCATION")
        print(f"{'='*80}")
        print(f"Total: {target} questions")
        print(f"Single Correct: {single_count} questions ({single_correct_percentage}%)")
        print(f"Multiple Correct: {multiple_count} questions ({100 - single_correct_percentage}%)")
        print(f"{'='*80}\n")
    
    print(f"{'='*80}")
    print(f"DYNAMIC QUESTION ALLOCATION")
    print(f"{'='*80}")
    print(f"Target: {target} questions")
    print(f"Chunks: {len(chunks)}")
    print(f"Base per chunk: {base_per_chunk}")
    print(f"Remainder: {remainder} (distributed to first {remainder} chunks)")
    print(f"{'='*80}\n")
    
    # ---------------- GLOBAL TYPE TARGETS (FOR MIXED MODE RATIO ENFORCEMENT) ----------------
    if question_type == "mixed":
        target_single = round(num_questions * single_correct_percentage / 100)
        target_multiple = num_questions - target_single
        print(f"Mixed Mode Type Targets:")
        print(f"   Single Correct: {target_single} questions ({single_correct_percentage}%)")
        print(f"   Multiple Correct: {target_multiple} questions ({100 - single_correct_percentage}%)\n")
    else:
        target_single = num_questions if question_type == "single" else 0
        target_multiple = num_questions if question_type == "multiple" else 0
    
    all_questions = []
    global_q_id = 1
    failed_chunks = []
    successful_chunks = 0
    
    # Initialize counters for mixed mode
    if question_type == "mixed":
        remaining_single = round(target * single_correct_percentage / 100)
        remaining_multiple = target - remaining_single
    else:
        remaining_single = 0
        remaining_multiple = 0

    # ---------------- STEP 4: PROCESS ALL CHUNKS (NO EARLY STOPPING) ----------------
    for idx, chunk in enumerate(chunks):
        # Calculate questions for this chunk
        chunk_target = base_per_chunk + (1 if idx < remainder else 0)
        
        # Determine question type for this chunk in mixed mode (do this BEFORE calculating generation count)
        if question_type == "mixed":
            # Distribute based on remaining counts
            chunk_type = "single" if (remaining_single > 0 and (remaining_multiple == 0 or remaining_single >= remaining_multiple)) else "multiple"
            if chunk_type == "single":
                remaining_single -= chunk_target
            else:
                remaining_multiple -= chunk_target
        else:
            chunk_type = question_type
        
        # For multiple correct, generate more (handle 60-70% rejection rate)
        # For single correct, generate extra buffer
        if chunk_type == "multiple":
            chunk_generate = max(chunk_target + 6, int(chunk_target * MULTIPLE_CORRECT_MULTIPLIER))
        else:
            chunk_generate = max(chunk_target + 2, int(chunk_target * SINGLE_CORRECT_MULTIPLIER))
        
        print(f"\n[Chunk {idx + 1}/{len(chunks)}] Processing (type: {chunk_type}, size: {len(chunk)} chars, target: {chunk_target}, generating: {chunk_generate})...")
        
        try:
            # Build prompt for this chunk
            prompt = build_prompt(chunk, global_q_id, max_questions=chunk_generate, question_type=chunk_type, difficulty=difficulty)

            # Call Groq API
            try:
                print(f"[Chunk {idx + 1}] Calling Groq API for ~{chunk_generate} questions...")
                
                # Call Groq API using traced helper function
                response = generate_questions_with_llm(prompt)
                
                print(f"[Chunk {idx + 1}] API call successful")
            except Exception as api_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"API Error: {str(api_error)}"
                })
                print(f"[Chunk {idx + 1}] FAILED - API Error: {str(api_error)}")
                continue

            # Parse JSON response
            try:
                print(f"[Chunk {idx + 1}] Parsing JSON response...")
                data = json.loads(response.choices[0].message.content)
                raw_questions = data.get("questions", [])
                print(f"[Chunk {idx + 1}] Received {len(raw_questions)} raw questions from LLM")
                
                # HARD VALIDATION: Filter out junk questions with proper type validation
                # Also log rejection reasons for debugging
                questions = []
                rejected_reasons = {}
                
                for q in raw_questions:
                    if is_valid_question(q, expected_options=num_options, question_type=chunk_type):
                        questions.append(q)
                    else:
                        # Determine rejection reason
                        reason = "Unknown"
                        if not q.get("question") or not q.get("options"):
                            reason = "Missing question or options"
                        elif len(q.get("options", [])) != num_options:
                            reason = f"Wrong option count ({len(q.get('options', []))} vs {num_options})"
                        elif not q.get("correct_options"):
                            reason = "No correct_options"
                        elif chunk_type == "single" and len(q.get("correct_options", [])) != 1:
                            reason = f"Single type needs 1 correct, got {len(q.get('correct_options', []))}"
                        elif chunk_type == "multiple" and (len(q.get("correct_options", [])) < 2 or len(q.get("correct_options", [])) > 4):
                            reason = f"Multiple type needs 2-4 correct, got {len(q.get('correct_options', []))}"
                        elif len(q.get("question", "")) < 30 or len(q.get("question", "")) > 250:
                            reason = f"Question length invalid ({len(q.get('question', ''))} chars)"
                        
                        rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1
                
                if len(questions) < len(raw_questions):
                    rejected = len(raw_questions) - len(questions)
                    print(f"[Chunk {idx + 1}] Rejected {rejected} invalid questions:")
                    for reason, count in rejected_reasons.items():
                        print(f"   - {reason}: {count}")
                
                print(f"[Chunk {idx + 1}] JSON parsed - {len(questions)} valid questions")
            except (json.JSONDecodeError, KeyError, IndexError) as parse_error:
                failed_chunks.append({
                    "chunk_index": idx,
                    "error": f"JSON Parse Error: {str(parse_error)}"
                })
                print(f"[Chunk {idx + 1}] FAILED - JSON Parse Error: {str(parse_error)}")
                continue

            # Fix IDs sequentially and assign type
            for q in questions:
                q["id"] = global_q_id
                q["chunk_index"] = idx  # Track chunk origin for backfilling
                q["type"] = chunk_type  # Assign the question type (single/multiple)
                global_q_id += 1

            # Add questions directly (no embeddings needed)
            all_questions.extend(questions)
            successful_chunks += 1
            print(f"[Chunk {idx + 1}] Added {len(questions)} questions")

        except Exception as general_error:
            failed_chunks.append({
                "chunk_index": idx,
                "error": f"Unexpected Error: {str(general_error)}"
            })
            print(f"[Chunk {idx + 1}] FAILED - Unexpected Error: {str(general_error)}")
            continue

    # ---------------- SUMMARY ----------------
    print(f"\n{'='*60}")
    print(f"Generation Complete Summary:")
    print(f"  Total Chunks: {len(chunks)}")
    print(f"  Successfully Processed: {successful_chunks}")
    print(f"  Failed Chunks: {len(failed_chunks)}")
    print(f"  Total Questions Generated (before selection): {len(all_questions)}")
    if failed_chunks:
        print(f"  Failed Chunk Indices: {[fc['chunk_index'] for fc in failed_chunks]}")
    print(f"{'='*60}\n")
    
    # ---------------- STEP 5: ASSIGN SUBTOPICS (PARALLEL) ----------------
    if all_questions and dynamic_subtopics:
        tag_questions_with_subtopics(all_questions, dynamic_subtopics)
    
    # ---------------- STEP 6: SELECT BEST N QUESTIONS USING QUALITY SCORING ----------------
    print(f"{'='*80}")
    print(f"SELECTING BEST {num_questions} QUESTIONS")
    print(f"{'='*80}")
    
    if len(all_questions) > num_questions:
        all_questions = select_best_questions(
            all_questions,
            num_questions
        )
        print(f"Selected exactly {len(all_questions)} questions using quality scoring\n")
    else:
        print(f"Generated {len(all_questions)} questions (target: {num_questions})\n")
    
    # ---------------- HARD TYPE RATIO ENFORCEMENT (MIXED MODE) ----------------
    if question_type == "mixed" and len(all_questions) >= num_questions:
        print(f"{'='*80}")
        print(f"ENFORCING TYPE RATIO (MIXED MODE)")
        print(f"{'='*80}")
        print(f"Before ratio enforcement: {len(all_questions)} questions")
        
        # Count current distribution
        current_single = sum(1 for q in all_questions if q.get('type') == 'single')
        current_multiple = len(all_questions) - current_single
        print(f"Current: {current_single} single, {current_multiple} multiple")
        print(f"Target: {target_single} single, {target_multiple} multiple")
        
        all_questions = enforce_type_ratio(
            all_questions,
            target_single,
            target_multiple
        )
        
        # Verify final distribution
        final_single = sum(1 for q in all_questions if q.get('type') == 'single')
        final_multiple = len(all_questions) - final_single
        print(f"Final: {final_single} single, {final_multiple} multiple")
        print(f"Exact ratio enforced!")
        print(f"{'='*80}\n")
    
    # ---------------- GLOBAL REGENERATION LOOP (DEFICIT RECOVERY) ----------------
    
    # Early exit if we have 90% or more of target questions
    if len(all_questions) >= int(0.9 * num_questions):
        print(f"Sufficient questions generated ({len(all_questions)}/{num_questions} = {len(all_questions)/num_questions*100:.1f}%)")
        print(f"   Skipping regeneration (>=90% threshold met)\n")
    else:
        # Build ranking of chunks by question success rate
        from collections import Counter
        
        chunk_success_count = Counter(
            q["chunk_index"] for q in all_questions if "chunk_index" in q
        )
        
        # Sort chunks by success rate (best first)
        best_chunks = [
            idx for idx, _ in chunk_success_count.most_common()
        ]
        
        if not best_chunks:
            # Fallback: if no chunks have questions yet, use all chunks
            best_chunks = list(range(len(chunks)))
        
        print(f"Chunk success distribution: {dict(chunk_success_count.most_common())}")
        print(f"Will regenerate from top {len(best_chunks)} performing chunks\n")
        
        retry = 0
        total_regen_calls = 0  # Track total API calls across all retries
    
        while len(all_questions) < num_questions and retry < MAX_REGENERATION_RETRIES and total_regen_calls < MAX_TOTAL_REGEN_CALLS:
            deficit = num_questions - len(all_questions)
            print(f"{'='*80}")
            print(f"REGENERATION ATTEMPT {retry + 1}/{MAX_REGENERATION_RETRIES}")
            print(f"{'='*80}")
            print(f"Current: {len(all_questions)} questions")
            print(f"Target: {num_questions} questions")
            print(f"Deficit: {deficit} questions")
            print(f"Regenerating {deficit} {'multiple-correct' if question_type == 'multiple' else question_type} questions...\n")
            
            # Determine type to regenerate
            if question_type == "mixed":
                # Check which type is short
                current_single = sum(1 for q in all_questions if q.get('type') == 'single')
                current_multiple = len(all_questions) - current_single
                single_short = target_single - current_single
                multiple_short = target_multiple - current_multiple
                
                if single_short > 0 and multiple_short > 0:
                    # Both short - prioritize multiple since it has higher rejection
                    regen_type = "multiple"
                    regen_count = min(deficit, multiple_short)
                elif single_short > 0:
                    regen_type = "single"
                    regen_count = min(deficit, single_short)
                else:
                    regen_type = "multiple"
                    regen_count = min(deficit, multiple_short)
            else:
                regen_type = question_type
                regen_count = deficit
            
            # Regenerate from best performing chunks only
            regenerated = 0
            for idx in best_chunks:
                if regenerated >= deficit:
                    break
                
                # Enforce hard limit on total regeneration calls
                if total_regen_calls >= MAX_TOTAL_REGEN_CALLS:
                    print(f"Regeneration call cap reached ({MAX_TOTAL_REGEN_CALLS} calls)")
                    print(f"   Stopping further regeneration for production safety\n")
                    break
                
                chunk = chunks[idx]
                
                # Calculate batch size accounting for mixed-mode constraints
                batch_size = min(3, regen_count, deficit - regenerated)
            
                print(f"[Regen Chunk {idx + 1}/{len(chunks)}] Generating {batch_size} {regen_type} questions...")
                
                try:
                    total_regen_calls += 1  # Track API call count
                    
                    prompt = build_prompt(
                        chunk,
                        global_q_id,
                        max_questions=batch_size,
                        question_type=regen_type,
                        difficulty=difficulty
                    )
                    
                    # Call Groq API using traced helper function
                    response = generate_questions_with_llm(prompt)
                    
                    data = json.loads(response.choices[0].message.content)
                    new_questions = [
                        q for q in data.get("questions", [])
                        if is_valid_question(q, expected_options=num_options, question_type=regen_type)
                    ]
                    
                    # Assign IDs and type
                    for q in new_questions:
                        q["id"] = global_q_id
                        q["chunk_index"] = idx
                        q["type"] = regen_type
                        global_q_id += 1
                    
                    if new_questions:
                        all_questions.extend(new_questions)
                        regenerated += len(new_questions)
                        print(f"[Regen Chunk {idx + 1}] Added {len(new_questions)} valid questions (total: {len(all_questions)})")
                    else:
                        print(f"[Regen Chunk {idx + 1}] No valid questions generated")
                        
                except Exception as regen_error:
                    print(f"[Regen Chunk {idx + 1}] Error: {str(regen_error)}")
                    continue
            
            retry += 1
            print(f"\nRegeneration round {retry} complete: Added {regenerated} questions")
            print(f"Total API calls used: {total_regen_calls}/{MAX_TOTAL_REGEN_CALLS}")
            print(f"Current total: {len(all_questions)}/{num_questions}\n")
    
    if len(all_questions) < num_questions:
        print(f"After {MAX_REGENERATION_RETRIES} retries, still short by {num_questions - len(all_questions)} questions")
    else:
        print(f"Successfully reached target: {len(all_questions)}/{num_questions} questions\n")
    
    # ---------------- GLOBAL VALIDATION: ENFORCE OPTION COUNT ----------------
    print(f"{'='*80}")
    print(f"FINAL VALIDATION")
    print(f"{'='*80}")
    
    pre_validation_count = len(all_questions)
    all_questions = [
        q for q in all_questions
        if is_valid_question(q, expected_options=num_options, question_type=q.get('type', 'single'))
    ]
    
    rejected_final = pre_validation_count - len(all_questions)
    if rejected_final > 0:
        print(f"Rejected {rejected_final} questions in final validation")
    
    # HARD SAFETY BACKFILL if we're under target
    if len(all_questions) < num_questions:
        shortage = num_questions - len(all_questions)
        print(f"Short by {shortage} questions after validation")
        print(f"   Keeping best available: {len(all_questions)} questions")
    
    print(f"Final validated count: {len(all_questions)} questions")
    print(f"{'='*80}\n")
    
    # ---------------- SAVE CONSOLIDATED QUESTIONS TO MONGODB ----------------
    consolidated_question_set_id = None
    if transcript_id and all_questions:
        try:
            # First, delete any old chunk-level documents for this transcript
            try:
                delete_result = question_sets_collection.delete_many({
                    "transcript_id": transcript_id,
                    "chunk_index": {"$ne": -1}  # Delete all non-consolidated chunks
                })
                if delete_result.deleted_count > 0:
                    print(f"Deleted {delete_result.deleted_count} old chunk document(s)")
            except Exception as del_error:
                print(f"Warning: Failed to delete old chunks - {str(del_error)}")
            
            print(f"Saving consolidated question set to MongoDB...")
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
            print(f"Consolidated questions saved (doc_id: {consolidated_question_set_id})")
        except Exception as db_error:
            print(f"Failed to save consolidated questions: {str(db_error)}")

    return JSONResponse(content={
        "transcript_id": str(transcript_id) if transcript_id else None,
        "question_set_id": str(consolidated_question_set_id) if consolidated_question_set_id else None,
        "total_questions": len(all_questions),
        "questions": all_questions,
        "subtopics": dynamic_subtopics,
        "total_chunks": len(chunks),
        "processed_chunks": successful_chunks,
        "failed_chunks": failed_chunks,
        "preprocessing_stats": {
            "original_length": original_length,
            "cleaned_length": cleaned_length,
            "original_lines": original_lines,
            "cleaned_lines": cleaned_lines,
            "original_words": original_words,
            "cleaned_words": cleaned_words,
            "chars_removed_percent": chars_removed_percent,
            "lines_removed_percent": lines_removed_percent,
            "words_removed_percent": words_removed_percent
        },
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
            
            # Ensure updated_at is string
            if 'updated_at' in doc:
                doc['updated_at'] = doc['updated_at'].isoformat() if hasattr(doc['updated_at'], 'isoformat') else str(doc['updated_at'])
            
            # Ensure last_validated_at is string
            if 'last_validated_at' in doc:
                doc['last_validated_at'] = doc['last_validated_at'].isoformat() if hasattr(doc['last_validated_at'], 'isoformat') else str(doc['last_validated_at'])
            
            question_sets.append(doc)
        
        print(f"\nFetched {len(question_sets)} question sets from MongoDB")
        
        return JSONResponse(content={
            "success": True,
            "question_sets": question_sets,
            "total": len(question_sets)
        })
        
    except Exception as e:
        print(f"Error fetching question sets: {str(e)}")
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
        
        if 'updated_at' in doc:
            doc['updated_at'] = doc['updated_at'].isoformat() if hasattr(doc['updated_at'], 'isoformat') else str(doc['updated_at'])
        
        if 'last_validated_at' in doc:
            doc['last_validated_at'] = doc['last_validated_at'].isoformat() if hasattr(doc['last_validated_at'], 'isoformat') else str(doc['last_validated_at'])
        
        return JSONResponse(content={
            "success": True,
            "question_set": doc
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching question set: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch question set: {str(e)}"
        )


@app.put("/api/question-sets/{question_set_id}")
async def update_question_set(question_set_id: str, request: dict = Body(...)) -> JSONResponse:
    """
    Update questions in a question set.
    Used by admin to save edited questions from Question Bank.
    """
    try:
        # Convert string to ObjectId
        try:
            set_obj_id = ObjectId(question_set_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid question set ID format")
        
        # Get updated questions from request
        updated_questions = request.get("questions", [])
        
        if not updated_questions:
            raise HTTPException(status_code=400, detail="No questions provided")
        
        # Update the question set in MongoDB
        result = question_sets_collection.update_one(
            {"_id": set_obj_id, "is_consolidated": True},
            {
                "$set": {
                    "questions": updated_questions,
                    "num_questions": len(updated_questions),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Question set not found with ID {question_set_id}"
            )
        
        print(f"Updated {len(updated_questions)} questions in question set {question_set_id}")
        
        return JSONResponse(content={
            "success": True,
            "message": "Questions updated successfully",
            "num_questions": len(updated_questions)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating question set: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update question set: {str(e)}"
        )


# ============================================================
# AI QUESTION VALIDATION (Single-Model Blind Evaluation)
# ============================================================

@app.post("/api/ai-validate")
async def ai_validate_questions(request: dict = Body(...)) -> JSONResponse:
    """
    Single-model blind validation of questions.
    Admin selects ONE model → that model evaluates question quality.
    Model acts as test-taker (doesn't see correct answers).
    """
    try:
        question_set_id = request.get("question_set_id")
        model_name = request.get("model_name", "llama-3.1-8b-instant")  # Default to LLaMA
        
        if not question_set_id:
            raise HTTPException(status_code=400, detail="question_set_id required")
        
        # Fetch question set from MongoDB
        try:
            set_obj_id = ObjectId(question_set_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid question set ID format")
        
        doc = question_sets_collection.find_one({"_id": set_obj_id, "is_consolidated": True})
        if not doc:
            raise HTTPException(status_code=404, detail="Question set not found")
        
        questions = doc.get("questions", [])
        if not questions:
            raise HTTPException(status_code=400, detail="No questions in question set")
        
        print(f"\n{'='*80}")
        print(f"AI VALIDATION STARTED")
        print(f"Model: {model_name}")
        print(f"Questions: {len(questions)}")
        print(f"Validation Version: v1")
        print(f"{'='*80}\n")
        
        # Validate each question with AI
        validation_results = []
        
        for idx, q in enumerate(questions, 1):
            print(f"\n[{idx}/{len(questions)}] Validating: {q['question'][:60]}...")
            
            try:
                # Prepare blind question (no correct answer revealed)
                # Convert list format to dict format for backward compatibility
                options_dict = {chr(65 + i): opt for i, opt in enumerate(q["options"])}
                
                blind_question = {
                    "question_id": q.get("id", f"Q{idx}"),
                    "question_type": q.get("type", "single"),
                    "question": q["question"],
                    "options": options_dict,
                    "num_correct_expected": len(q.get("correct_options", [])),
                    "difficulty": q.get("difficulty", "medium")
                }
                
                # Get AI's answer (blind evaluation)
                ai_response = await evaluate_question_with_ai(blind_question, model_name)
                
                # Calculate quality score by comparing with ground truth
                quality_metrics = calculate_quality_score(q, ai_response)
                
                # Combine results
                # Convert correct_options indices to letters (A, B, C, D)
                correct_letters = [chr(65 + idx) for idx in q.get("correct_options", [])]
                
                validation_result = {
                    "question_id": blind_question["question_id"],
                    "question": q["question"],
                    "options": q.get("options", []),
                    "model_used": model_name,
                    "ai_selected": ai_response["selected_options"],
                    "correct_answer": correct_letters,
                    "confidence": ai_response["confidence"],
                    "reasoning": ai_response["reasoning"],
                    "ambiguity_flag": ai_response["ambiguity_flag"],
                    "difficulty_estimate": ai_response["difficulty_estimate"],
                    "quality_score": quality_metrics["quality_score"],
                    "answer_accuracy": quality_metrics["answer_accuracy"],
                    "option_quality": quality_metrics["option_quality"],
                    "difficulty_match": quality_metrics["difficulty_match"],
                    "question_type_issue": quality_metrics["question_type_issue"]
                }
                
                validation_results.append(validation_result)
                print(f"Quality Score: {quality_metrics['quality_score']:.2f} | Accuracy: {quality_metrics['answer_accuracy']:.2f}")
                
            except Exception as e:
                print(f"Error validating question {idx}: {str(e)}")
                validation_results.append({
                    "question_id": q.get("id", f"Q{idx}"),
                    "question": q["question"],
                    "error": str(e),
                    "quality_score": 0.0
                })
        
        # Calculate overall statistics
        valid_scores = [r["quality_score"] for r in validation_results if "error" not in r]
        avg_quality = sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
        
        print(f"\n{'='*80}")
        print(f"VALIDATION COMPLETE")
        print(f"Average Quality Score: {avg_quality:.2f}")
        print(f"{'='*80}\n")
        
        # Store validation results in MongoDB for future use
        question_sets_collection.update_one(
            {"_id": set_obj_id},
            {
                "$set": {
                    "ai_validation_results": validation_results,
                    "validation_version": "v1",
                    "last_validated_at": datetime.utcnow(),
                    "validation_model": model_name
                }
            }
        )
        
        return JSONResponse(content={
            "success": True,
            "model_used": model_name,
            "total_questions": len(questions),
            "average_quality": round(avg_quality, 2),
            "results": validation_results
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in AI validation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"AI validation failed: {str(e)}"
        )


async def evaluate_question_with_ai(blind_question: dict, model_name: str) -> dict:
    """
    Send question to AI model for blind evaluation.
    Model acts as test-taker (doesn't see correct answer).
    """
    
    # Build prompt for AI to answer the question
    question_type = blind_question["question_type"]
    num_correct = blind_question["num_correct_expected"]
    
    if question_type == "multiple":
        instruction = f"Select exactly {num_correct} correct options."
    else:
        instruction = "Select exactly 1 correct option."
    
    prompt = f"""You are taking a quiz. Answer the following question to the best of your knowledge.

Question: {blind_question['question']}

Options:
{chr(10).join([f"{opt}. {text}" for opt, text in blind_question['options'].items() if isinstance(text, str)])}

{instruction}

Respond in JSON format:
{{
  "selected_options": ["A", "B"],  // Your answer(s)
  "confidence": 0.85,  // 0-1 scale
  "reasoning": "Brief explanation of your answer",
  "ambiguity_flag": false,  // true if question is confusing/ambiguous
  "difficulty_estimate": "medium"  // easy/medium/hard
}}

JSON Response:"""
    
    try:
        # Call Groq API with selected model
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500
        )
        
        raw = response.choices[0].message.content.strip()
        
        # Parse JSON response
        import json
        import re
        
        # Extract JSON from response, handling potential text before/after JSON
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            ai_answer = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found in AI response")
        
        # Validate structure
        if "selected_options" not in ai_answer:
            raise ValueError("AI response missing selected_options")
        
        # Ensure selected_options is a list
        if isinstance(ai_answer["selected_options"], str):
            ai_answer["selected_options"] = [ai_answer["selected_options"]]
        
        # Set defaults for missing fields
        ai_answer.setdefault("confidence", 0.5)
        ai_answer.setdefault("reasoning", "No reasoning provided")
        ai_answer.setdefault("ambiguity_flag", False)
        ai_answer.setdefault("difficulty_estimate", "medium")
        
        return ai_answer
        
    except Exception as e:
        print(f"AI evaluation error: {str(e)}")
        # Return default response on error
        return {
            "selected_options": [],
            "confidence": 0.0,
            "reasoning": f"Error: {str(e)}",
            "ambiguity_flag": True,
            "difficulty_estimate": "unknown"
        }


def calculate_quality_score(question: dict, ai_response: dict) -> dict:
    """
    Calculate question quality by comparing AI response with ground truth.
    
    Quality Score = 
      0.45 × Answer Accuracy
    + 0.20 × Confidence  
    + 0.15 × Option Quality
    + 0.10 × Difficulty Match
    - 0.25 × Ambiguity
    """
    
    # Extract ground truth - convert indices to letters (A, B, C, D)
    correct_options = {chr(65 + idx) for idx in question.get("correct_options", [])}
    ai_selected = set(ai_response.get("selected_options", []))
    
    # 1. Answer Accuracy
    if len(correct_options) == 0:
        answer_accuracy = 0.0
    else:
        intersection = len(ai_selected & correct_options)
        answer_accuracy = intersection / len(correct_options)
    
    # 2. Penalty for extra selections (over-selection)
    extra_selections = max(0, len(ai_selected) - len(correct_options))
    penalty = extra_selections * 0.15
    
    # 3. Confidence (0-1 scale)
    confidence = float(ai_response.get("confidence", 0.5))
    # Clamp confidence to valid range to handle edge cases
    confidence = min(1.0, max(0.0, confidence))
    
    # 4. Option Quality (behavior-based scoring)
    reasoning = ai_response.get("reasoning", "").lower()
    confused = ai_response.get("ambiguity_flag", False)
    correct_count_match = (len(ai_selected) == len(correct_options))
    
    option_quality = 1.0
    if confused:
        option_quality -= 0.4
    if not correct_count_match:
        option_quality -= 0.3
    
    option_quality = max(0.0, option_quality)
    
    # 5. Difficulty Match
    expected_diff = question.get("difficulty", "medium").lower()
    estimated_diff = ai_response.get("difficulty_estimate", "medium").lower()
    difficulty_match = 1.0 if expected_diff == estimated_diff else 0.5
    
    # 6. Ambiguity Flag
    ambiguity = 1.0 if ai_response.get("ambiguity_flag", False) else 0.0
    
    # 7. Detect instruction-dependent questions
    instruction_keywords = ["depends", "without context", "hard to tell", "not enough information"]
    question_type_issue = None
    if any(keyword in reasoning for keyword in instruction_keywords):
        question_type_issue = "instruction-dependent"
    
    # Calculate final quality score
    quality_score = (
        0.45 * answer_accuracy +
        0.20 * confidence +
        0.15 * option_quality +
        0.10 * difficulty_match -
        0.25 * ambiguity -
        penalty
    )
    
    # Clamp to [0, 1]
    quality_score = max(0.0, min(1.0, quality_score))
    
    return {
        "quality_score": round(quality_score, 2),
        "answer_accuracy": round(answer_accuracy, 2),
        "option_quality": round(option_quality, 2),
        "difficulty_match": round(difficulty_match, 2),
        "penalty": round(penalty, 2),
        "question_type_issue": question_type_issue
    }



