# server/app/config.py
"""
Industry-level configuration for Quiz Generator.
Essential parameters that significantly impact performance and quality.
"""

# ==================== MODEL CONFIGURATION ====================
# Choose from available models (Meta LLaMA or OpenAI OSS)

# GENERATION MODEL (Question Generation)
GROQ_MODEL_NAME = "llama-3.1-8b-instant"  # Fast & cost-efficient
# Alternative options:
# "llama-3.3-70b-versatile"  # Better quality, slower, higher cost
# "openai/gpt-oss-20b"       # OpenAI OSS model
# "openai/gpt-oss-120b"      # Highest quality, highest cost


# ==================== TEXT CHUNKING ====================
# Affects context quality and API costs

CHUNK_SIZE = 10000          # Characters per chunk
CHUNK_OVERLAP = 300         # Overlap to maintain context continuity


# ==================== GENERATION MULTIPLIERS ====================
# Balance quality vs API cost (handles LLM rejection rates)

SINGLE_CORRECT_MULTIPLIER = 1.3    # Generate 30% extra (low rejection rate)
MULTIPLE_CORRECT_MULTIPLIER = 2.5  # Generate 2.5x extra (60-70% rejection rate)


# ==================== QUALITY SCORING WEIGHTS ====================
# Used for question selection and ranking

LENGTH_WEIGHT = 15          # Weight for optimal length
DIFFICULTY_WEIGHT = 25      # Weight for difficulty level
OPTION_QUALITY_WEIGHT = 15  # Weight for option quality
DISTRACTOR_WEIGHT = 5       # Weight for distractor quality


# ==================== REGENERATION LIMITS ====================
# Prevents infinite API loops during deficit recovery

MAX_REGENERATION_RETRIES = 3       # Maximum retry attempts
REGENERATION_BATCH_SIZE = 6        # Questions per regeneration batch


# ==================== VALIDATION THRESHOLDS ====================

# Question length bounds (characters)
MIN_QUESTION_LENGTH = 30
MAX_QUESTION_LENGTH = 250

# Multiple-correct answer range (industry standard for MCQs)
MIN_CORRECT_OPTIONS = 2     # Minimum correct answers
MAX_CORRECT_OPTIONS = 4     # Maximum correct answers


# ==================== SUBTOPIC CLASSIFICATION ====================

MAX_KEYWORDS_PER_CHUNK = 8   # Keywords extracted per chunk
TOP_KEYWORDS_COUNT = 30      # Top keywords for global subtopic extraction
CLASSIFICATION_WORKERS = 3   # Parallel workers (rate-limit safe)


# ==================== VALIDATION ====================

def validate_config():
    """Validate configuration parameters."""
    if CHUNK_SIZE <= CHUNK_OVERLAP:
        raise ValueError("CHUNK_SIZE must be greater than CHUNK_OVERLAP")
    
    return True


# Validate on import
validate_config()
