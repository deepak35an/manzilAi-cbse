"""
Topic-wise study plan and test generation pipeline.

The subject material below is extracted from the supplied question-bank JSON.
The pipeline keeps the original Gemini generation + validation + optional
database-upsert workflow, but creates topic-wise tests instead of a week-wise
roadmap. No preparation duration, week count, or calendar schedule is used.

Run from the backend root:
    python pipelines/generate_study_plan.py

Required .env variable:
    GEMINI_API_KEY

Optional .env variable for database upsert:
    DATABASE_URL
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

# ── Backend imports and environment ──────────────────────────────────────────

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

# ── Configuration ────────────────────────────────────────────────────────────

# Keep this identifier aligned with ContentRegistry.subfolder in your project.
EXAM_KEY: str = "CBSE_10_SOCIAL_SCIENCE"

OUTPUT_DIR = Path(__file__).parent / "output"

# Source question bank used to fill QUESTION_COUNT when omitted from SUBJECT_MATERIAL.
QUESTION_BANK_PATH = (
    BACKEND_ROOT
    / "data"
    / "Examination Content"
    / "CBSE_10"
    / "CBSE_Class10_SocialScience_PYQ.json"
)

# Extracted from the supplied question-bank JSON.
# Question counts are the number of source questions for each topic.
# Subtopic labels and their order are preserved from first appearance in JSON.
# TOPIC lines may be either:
#   TOPIC: Name | QUESTION_COUNT: 42
#   TOPIC: Name
# When QUESTION_COUNT is omitted, counts are taken from QUESTION_BANK_PATH.
SUBJECT_MATERIAL = r"""
SUBJECT: Social Science
  TOPIC: The Rise of Nationalism in Europe
    - Chronology of European nationalist events
    - Giuseppe Mazzini and Young Italy
    - Congress of Vienna
    - German unification
    - Giuseppe Mazzini
    - Habsburg Empire
    - Young Europe
    - Napoleonic Code
    - Frederic Sorrieu's vision
    - Italian unification
    - Germania allegory symbols
    - Chronology of European unification
    - Sequence of Italian unification
    - European chronology
    - Symbols of freedom
    - Giuseppe Garibaldi
    - Balkan nationalism
    - Romantic nationalism
    - Act of Union 1707
    - Nineteenth-century chronology
    - Zollverein customs union
    - Economic liberalism
    - Nationalist symbols
    - Germania allegory
    - Post-Napoleonic conservatism
    - Nationalist chronology
    - Marianne allegory
    - Italian unification leaders
    - Allegory of a new era
    - Act of Union
    - Zollverein
    - German unification wars
    - German emperor
    - Silesian weavers
    - British nation-state
    - Grimm folktales
    - Cultural nationalism
    - Foreign domination and culture
    - Collective belonging
    - Conservative regimes of 1815
    - Conservative censorship
    - French revolutionary influence
    - European rivalry
    - Anti-imperial movements
    - Imperial rivalry
    - Nineteenth-century Europe
    - British Isles ethnic groups
    - French tricolour
    - Formation of Britain
    - Greek independence
    - Conservative ideology
    - Congress of Vienna aims
    - Balance of power
    - French Revolution and nationalism
    - Treaty of Vienna
    - Liberal nationalism
    - Metternich's remark
    - European political figures
    - Young Italy
    - Bismarck and German unification
    - Frédéric Sorrieu's vision
  TOPIC: Nationalism in India
    - Lahore Congress and Purna Swaraj
    - Chronology of the national movement
    - Poona Pact
    - Nationalist figures and symbols
    - Gandhian satyagrahas
    - Swaraj Party
    - Chronology of satyagraha movements
    - Depressed Classes Association
    - Chronology of national movement events
    - Formation of the Swaraj Party
    - Folklore and national identity
    - Civil Disobedience chronology
    - Leaders and movements
    - Founders of Swaraj Party
    - Chronology of national organisations and conferences
    - Rowlatt Act
    - Non-cooperation chronology
    - Persistence in mass movements
    - Civil Disobedience
    - Nationalist movement chronology
    - Bardoli movement
    - Gandhi in South Africa
    - Chauri Chaura
    - Vande Mataram
    - Chronology of nationalist events
    - Industrial workers and Civil Disobedience
    - Simon Commission
    - Start of Non-Cooperation
    - Irwin's dominion-status offer
  TOPIC: The Making of a Global World
    - Indian Ocean trade
    - Irish potato famine
    - Disease and conquest of the Americas
    - Colonisation of the Americas
    - Indus Valley coastal trade
    - American silver and Asian trade
    - Sea routes and pre-modern trade
    - Nineteenth-century migration
    - Spread of smallpox in America
    - Smallpox and European conquest
    - Silk Routes
    - Eighteenth-century Atlantic trade
    - Potato and European diets
    - El Dorado legend
    - Foods from the Americas
    - Spread of Buddhism along trade routes
    - Silk Routes trade
    - Buddhism and Silk Routes
    - Second World War alliances
    - Twentieth-century economic chronology
    - First World War alliances
    - Flows linking the world
    - Bretton Woods system
    - El Dorado
    - Colonial expansion
  TOPIC: The Age of Industrialisation
    - Mass production
    - Steam engine
    - Railways and heavy industry
  TOPIC: Print Culture and the Modern World
    - Books and authors
    - Print and despotism
    - Khalsa Tract Society
    - Writers and publications
    - Chronology of print
    - Chronology of Indian print
    - Early printed books
    - Calcutta book printing
    - Writers and works
    - Printed criticism of absolutism
    - Effects of print technology
    - Early printed books in Korea
    - Bal Gangadhar Tilak's newspaper
    - Colonial censorship
    - Regional language press
    - Publications and authors
    - Print and Indian nationalism
    - Caricatures in newspapers
    - Samvad Kaumudi
    - Martin Luther on printing
    - Rashsundari Devi's autobiography
    - Vernacular Press Act
    - Printing in China
    - Print revolution
    - Caste critique in print
    - Gulamgiri
    - Women's writings
    - Gutenberg Bible
    - Bengal Gazette
    - Index of prohibited books
    - Rashsundari Devi autobiography
    - Tilak's newspaper
    - Gita Govind
    - Print chronology
    - Tarabai Shinde
    - Manuscript fragility
    - Chapmen
    - Bibliothèque Bleue
    - Print and the French Revolution
    - Raja Ram Mohan Roy's newspaper
    - Scientific ideas and print
    - Early printed materials
    - Martin Luther and print
    - Arrival of printing in India
    - Hickey's Bengal Gazette
    - Persian-language newspapers
    - Early printed books in Japan
    - Indian print reformers
  TOPIC: The Nationalist Movement in Indo-China
    - French exploration of the Mekong
    - Tonkin Free School
    - Hoa Hao movement
  TOPIC: Resources and Development
    - Bhoodan-Gramdan Movement
    - Factors affecting land use
    - Soil characteristics
    - Land use categories
    - Black soil properties
    - Current fallow land
    - Resource development
    - Black soil formation
    - Resource creation
    - Laterite soil
    - Alluvial soil
    - Black soil
    - Alluvial soil distribution
    - Resource classification
    - Alluvial soil composition
    - Land degradation by mining
    - Laterite soil distribution
    - Types of soil erosion
    - Land-use categories
    - Resource categories
    - Exhaustible resources
    - Fallow land
    - Rio Earth Summit
    - Mountain relief
    - Land degradation
    - Renewable energy
    - Regional resource diversity
    - Resource planning
    - Resource overuse
    - Biotic and abiotic resources
  TOPIC: Forest and Wildlife Resources
    - Forests in the ecosystem
    - National parks and states
    - Chipko Movement
    - Permanent forests
    - Tiger poaching
    - Reserved and protected forests
    - Forest classification by area
    - Tiger reserves
    - Wild Life Protection Act
    - Protected areas and states
    - Tiger reserves and states
    - Permanent forests by state
    - Forest classification
    - Joint Forest Management
    - Reasons for wildlife conservation
    - Tiger conservation
    - Wildlife and power lines
    - Forest categories
    - Wildlife Protection Act
    - Community forest conservation
    - Forest classes
    - Endemic species
  TOPIC: Water Resources
    - Bamboo drip irrigation
    - Dams from north to south
    - Rooftop rainwater harvesting
    - Pradhan Mantri Krishi Sinchaee Yojana
    - Dams and rivers
    - Inter-state river disputes
    - Sardar Sarovar project
    - Historic artificial lakes
    - Tankas rainwater harvesting
    - Historic water conservation
    - Groundwater depletion
    - Bhakra Nangal project
    - Tungabhadra dam
    - River-dam pairs
    - Tehri Dam
  TOPIC: Agriculture
    - Climate requirements of rubber
    - Regional names of slash and burn farming
    - Jute growing regions and soils
    - Types of farming
    - Plantation crops
    - Kharif crops
    - Beej-Bachao Andolan
    - Sugarcane climate
    - Rabi crops
    - Conditions for cotton cultivation
    - Shifting cultivation
    - Coffee cultivation
    - Rubber cultivation
    - Jute as golden fibre
    - Soil for cotton cultivation
    - Jute cultivation
    - Crops and their types
    - Rice cultivation
    - Plantation agriculture features
    - Wheat cultivation
    - Commercial farming
    - Pulse crops
    - Maize cultivation
    - Coffee-growing region
    - Soil degradation
    - Crop diversification
    - Commercial crops
    - Agricultural inputs
    - Intensive farming in Punjab and Haryana
    - Industrial crops
    - Principal cereal crops
    - Subsistence farming
    - Land reforms
    - Commercial farming inputs
    - Comprehensive land development
    - Agricultural modernisation
    - Cropping diversification
    - Intensive subsistence farming
    - Primitive cultivation names
    - Zaid crops
    - Millets
  TOPIC: Minerals and Energy Resources
    - Iron ore types
    - Bauxite producing states
    - Types of coal
    - Atomic energy plant locations
    - Wind energy
    - Importance of minerals
    - Mineral producing centres
    - Solar energy potential
    - Thermal power plants
    - Uses of minerals
    - Placer mineral deposits
    - Nuclear power plants and states
    - Lignite coal
    - Mineral uses
    - Energy minerals
    - Mineral categories
    - Manganese production by state
    - Bauxite production
    - Geothermal energy
    - Solar energy
    - Mineral reserves
    - Kalpakkam nuclear plant
    - Location of energy and mineral sites
    - Kaiga nuclear plant
    - Rawatbhata nuclear plant
    - Kakrapara atomic power plant
    - Khetri copper mines
    - Nuclear power plants
    - Locations of minerals and energy resources
    - Non-metallic minerals
  TOPIC: Manufacturing Industries
    - Jute industry location
    - Agriculture-industry link
    - Industrial location
    - Secondary-sector industry
    - Sector classification
    - Farm modernisation
    - Industrial infrastructure
    - Private sector industries
    - Bauxite and aluminium
    - Electronics industry
  TOPIC: Lifelines of National Economy
    - Major ports
    - Sea ports and states
    - Mass communication
    - Natural harbours
    - Road density
  TOPIC: Power Sharing
    - Vertical division of power
    - Belgium language communities
    - Majoritarian policies in Sri Lanka
    - Horizontal division of power
    - Language communities in Brussels
    - Sri Lanka's majority community
    - Belgium and Sri Lanka
    - Sri Lankan majoritarianism
    - Belgium's location
    - Sri Lankan ethnic conflict
    - Belgian power-sharing arrangements
    - Belgian ethnic composition
    - Prudential value of power sharing
    - Belgian power-sharing arrangement
    - European Union headquarters
    - Sri Lanka's language communities
    - Belgian communities
    - Horizontal distribution of power
    - Belgian accommodation of diversity
    - Majoritarianism in Sri Lanka
    - Belgian power sharing measures
    - Belgian community government
    - Political terms
    - Brussels government
    - Checks and balances
    - Belgian power sharing
    - Belgian linguistic accommodation
    - Reasons for power sharing
    - Benefits of power sharing
    - Participation and legitimacy
    - Majoritarianism and power sharing
    - Conflict prevention
    - Accommodation of communities
    - Sri Lankan Tamil demands
    - Horizontal distribution
    - Belgian constitutional amendments
    - Sinhala Only Act
    - Belgium's language groups
    - Political stability
    - Belgium's neighbours
    - Belgium's community government
    - Accommodation of ethnic groups
    - Horizontal power sharing
    - Sinhala-only policy
    - Separation of powers
    - Forms of power sharing
    - Belgian accommodation
    - Belgium language groups
    - Sri Lankan Tamils
    - Sri Lankan communities
    - Belgium's languages
    - Ethnic composition of Sri Lanka
  TOPIC: Federalism
    - Panchayati Raj institutions
    - 1992 decentralisation reforms
    - Union, State and Concurrent Lists
    - Coming together federation
    - Houses of Parliament
    - Panchayati Raj
    - Urban local government
    - Union List and currency
    - Federal systems across countries
    - Power sharing in Belgium
    - Scheduled languages
    - Concurrent List
    - Division of power between levels
    - Local government constitutional amendments
    - Concurrent List subjects
    - Union List subjects
    - Linguistic states
    - Federal lists and powers
    - Decentralisation and local elections
    - Women's representation in panchayats
    - Decentralisation of power
    - Holding-together federation
    - Special provisions for north-eastern states
    - Constitutional division of powers
    - Legislative lists
    - Constitutional subject lists
    - Centre-state dispute resolution
    - Women's reservation in panchayats
    - State List subjects
    - Federal countries
    - Subsidiarity
    - Coming-together federation
    - Decentralisation
    - Centre-state powers
    - Article 371A
    - Judicial interpretation
    - Eighth Schedule languages
    - Quasi-federal features
    - Constitutional federalism
    - Presidential electoral college
    - Grass roots democracy
    - Constitutional status of local bodies
    - Gram sabha accountability
    - Local government finance
    - Constitutional amendment
    - Union List
    - State List
    - Levels of government
    - Language policy
  TOPIC: Gender, Religion and Caste
    - Feminism
    - Women in public life
    - Caste in politics
    - Women's reservation in local bodies
    - Equal voting rights
    - Women's equal treatment
    - Communal politics
    - Secularism
    - Secular state
    - Women's empowerment
    - Women's parliamentary representation
    - Constitutional secularism
    - Gender mobilisation
    - Women's movement
    - Family laws
    - Women's public participation
    - Secular constitution
    - Secularism in India
    - Women in parliaments
    - Women's political participation
    - Feminist movements
    - Gender and literacy
  TOPIC: Political Parties
    - Candidate affidavits
    - Regional parties and states
    - National and regional parties
    - Functions of political parties
    - Components of a political party
    - State parties
    - Party reform measures
    - Party registration and election symbols
    - Regional parties and election symbols
    - Multi-party system
    - Two-party systems
    - One-party system
    - Electoral accountability
    - Need for political parties
    - Party reform by Election Commission
    - India's multi-party system
    - Candidate disclosure rules
    - Representative democracy
    - Forming government
    - Party diversity
    - Regional party governments
    - Two-party system
    - Why India has multiple parties
    - Role of parties in democracy
    - Parties in democracy
    - Party alliances
    - Opposition parties
    - Regional parties
    - Recognised party benefits
  TOPIC: Outcomes of Democracy
    - Legitimacy and participation
    - Government accountability
    - Democracy since independence
    - Citizen participation in policy
    - Dignity and equality
    - Limits of democracy
    - Popular rule
    - Democratic principles
    - Political equality
    - Accountability
    - Rights protection
    - Representative accountability
    - Democratic limits
    - Elections and participation
    - Democracy's popularity
    - Acceptability of democracy
    - Correcting democratic mistakes
    - Accountability and legitimacy
    - Decision-making delay
    - Equality in democracy
    - Voting rights
    - Transparency
    - Legitimacy
    - Decision-making procedures
    - Legitimacy and elections
    - Common features of democracies
    - Attitudes toward democracy
  TOPIC: Popular Struggles and Movements
    - Nepal's democracy movement
  TOPIC: Development
    - Development goals of a rainfed farmer
    - Body Mass Index calculation
    - Development goals of educated youth
    - Literacy rate
    - Human Development Report indicators
    - Education indicators
    - Human Development Report
    - Literacy rate age group
    - Life expectancy comparison
    - Characteristics of developed countries
    - Infant mortality rate
    - Development goals
    - Average income
    - Net attendance ratio
    - Literacy rate comparison
    - Renewable resources
    - Limits of per capita income
    - Human Development Index rankings
    - Comparing HDI indicators
    - World Bank country classification
    - Development goals of a university student
    - Sustainable use of crude oil
    - Human Development Index
    - World Bank income criterion
    - Goals of landless rural labourers
    - Development and environmental sustainability
    - Gender gap in literacy
    - Infant mortality and public services
    - Average income calculation
    - World Bank development indicator
    - Goals of prosperous farmers
    - Economic development indicators
    - Literacy rate definition
    - Human Development Index ranking
    - State Human Development Index
    - Livelihood training
    - Health and education
    - World Bank country comparison
    - Human Development Index ranks
    - Human development measures
    - Factory worker goals
    - Non-monetary public goods
    - World Development Report
    - Planning Commission
    - Development factors
    - Average income definition
    - Different developmental goals
    - Girls' school attendance
    - Equal access to water
    - Sustainable development
    - Human development
    - Income distribution
    - Body Mass Index
    - Depleting resources
    - Public goods
    - Conflicting goals
    - Conflicting goals of dams
    - Per capita income
    - Different development goals
  TOPIC: Sectors of the Indian Economy
    - Interdependence of economic sectors
    - Gross domestic income from sectors
    - Sectors by ownership
    - Primary and tertiary activities
    - Public sector examples
    - Private sector ownership
    - Public sector ownership
    - Disguised unemployment
    - Tertiary-sector support
    - Primary sector activities
    - Secondary sector occupations
    - Gross domestic product
    - Tertiary sector activities
    - Organised sector employment
    - Private sector
    - Public and private companies
    - Tertiary occupations
    - Basis for economic sector classification
    - Unorganised sector employment
    - Secondary sector manufacturing
    - Rural employment guarantee
    - Public and private sector enterprises
    - Mixed economic sectors
    - Employment-based sector classification
    - Primary-sector employment
    - Organised sector work
    - Tertiary sector occupations
    - Organised sector enterprises
    - Basis of sector classification
    - Tertiary sector contribution to GDP
    - Floriculture as primary activity
    - Employment share of sectors
    - Animal husbandry
    - Interdependence of sectors
    - Employment statistics
    - Primary sector work
    - Organised sector benefits
    - Secondary sector
    - Unorganised sector
    - GDP by sector
    - Employment by sector
    - Tertiary sector services
    - Unorganised work
    - Organised-sector laws
    - Paid leave and job security
    - Public-sector examples
    - Organised and unorganised sectors
    - MGNREGA
    - Organised-sector welfare
    - Primary activities
    - Organised sector
    - Tertiary-sector services
    - Unorganised employment
    - Primary-sector underemployment
    - Underemployment
    - GDP calculation
    - Sector interdependence
    - Unorganised-sector leave
    - Unorganised-sector protections
    - Informalisation
    - Tertiary sector growth
    - Informal work
    - Classification of occupations
    - Public sector role
    - Public and private sectors
  TOPIC: Money and Credit
    - Rupee as legal tender
    - Informal credit sources
    - Formal credit for cultivation
    - Collateral
    - Demand deposits
    - Formal credit and debt traps
    - Cost of credit
    - Issuing currency notes
    - Double coincidence of wants
    - Formal credit access
    - Informal credit in urban areas
    - Rural credit sources
    - Barriers to formal loans
    - Formal sources of credit
    - Kisan Credit Card loans
    - Formal agricultural credit
    - Currency as a medium of exchange
    - Formal car loans
    - Productive role of credit
    - Regulation of formal credit
    - Purpose of bank loans
    - Formal credit sources
    - Reserve Bank of India functions
    - Productive use of credit
    - Legal tender
    - Collateral and bank lending
    - Informal credit dependence
    - Bank interest income
    - Money and barter
    - Self-help groups
    - Formal credit
    - Modern currency
    - Currency issuer
    - Self-help group decisions
    - Cooperative credit
    - Medium of exchange
    - Currency issuance
    - Debt trap
    - Informal-sector loans
    - Informal rural credit
    - Interest on bank deposits
  TOPIC: Globalisation and the Indian Economy
    - Meaning of liberalisation
    - Early trade and investment restrictions
    - Liberalisation
    - Import tariffs
    - Effects of foreign trade
    - Imported cotton and domestic farmers
    - Trade barriers
    - Effects of globalisation
    - Technology and globalisation
    - Information technology and globalisation
    - Digital connectivity
    - Internet and global communication
    - Trade and investment liberalisation
    - Transport and globalisation
    - Drivers of globalisation
    - Integration of markets
    - Aspects of globalisation
    - Market access through globalisation
    - Meaning of globalisation
    - Trade liberalisation
    - Founding of WTO
    - Foreign trade and markets
    - Definition of globalisation
    - Cross-border production
    - MNC advantages in India
    - MNC joint production
    - Uneven impact of globalisation
    - Cargill Foods origin
    - Multinational companies
    - 1991 trade policy
    - World Trade Organization
    - Globalisation policies
    - Examples of globalisation
    - MNC location factors
    - Foreign investment
    - Multinational corporations
    - Production in India
    - Interlinked production
    - Factors enabling globalisation
    - Special Economic Zones
  TOPIC: Consumer Rights
    - ISI certification mark
    - Hallmark certification
""".strip()

# Retained as weighting guidance from the original script.
# The topic names in this table may not match the source JSON, so the explicit
# question counts in SUBJECT_MATERIAL should be treated as the source of truth.
PRIORITY_DATA = """
Priority guidance:
- CRITICAL: topics with the largest number of source questions
- HIGH: topics with a high number of source questions
- MEDIUM: topics with a moderate number of source questions
- LOW: topics with fewer source questions

Use topic question counts as relative guidance only; do not predict future exam
weightage from this data.
""".strip()

# ── Pipeline logic ───────────────────────────────────────────────────────────

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/"
    "v1beta/models/gemini-3.8-flash:generateContent"
)


def slugify(value: str) -> str:
    """Create a stable lowercase snake_case identifier."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "topic"


def parse_subject_material(text: str) -> list[dict]:
    """
    Parse the extracted text into structured subject/topic/subtopic data.
    This keeps the prompt and validator aligned with the exact source material.
    """
    subjects = []
    current_subject = None
    current_topic = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("SUBJECT:"):
            subject_name = line.removeprefix("SUBJECT:").strip()
            current_subject = {"subject": subject_name, "topics": []}
            subjects.append(current_subject)
            current_topic = None

        elif line.startswith("TOPIC:"):
            if current_subject is None:
                raise ValueError("SUBJECT_MATERIAL contains a topic before a subject.")

            topic_part = line.removeprefix("TOPIC:").strip()
            match = re.match(r"^(.*?)\s*\|\s*QUESTION_COUNT:\s*(\d+)\s*$", topic_part)
            if match:
                topic_name = match.group(1).strip()
                question_count: Optional[int] = int(match.group(2))
            else:
                topic_name = topic_part.strip()
                question_count = None
            if not topic_name:
                raise ValueError(f"Invalid topic line in SUBJECT_MATERIAL: {line}")

            current_topic = {
                "subject": current_subject["subject"],
                "topic": topic_name,
                "question_count": question_count,
                "subtopics": [],
            }
            current_subject["topics"].append(current_topic)

        elif line.startswith("- "):
            if current_topic is None:
                raise ValueError("SUBJECT_MATERIAL contains a subtopic before a topic.")
            current_topic["subtopics"].append(line[2:].strip())

        else:
            raise ValueError(f"Unrecognised SUBJECT_MATERIAL line: {line}")

    if not subjects or not any(s["topics"] for s in subjects):
        raise ValueError("SUBJECT_MATERIAL did not contain any topics.")

    return subjects


def apply_question_counts_from_bank(
    subjects: list[dict],
    bank_path: Path,
) -> list[dict]:
    """Fill missing topic question_count values from the PYQ JSON bank."""
    missing = [
        topic
        for subject in subjects
        for topic in subject["topics"]
        if topic["question_count"] is None
    ]
    if not missing:
        return subjects

    if not bank_path.is_file():
        raise FileNotFoundError(
            f"QUESTION_COUNT omitted for {len(missing)} topic(s), but question bank "
            f"was not found at {bank_path}"
        )

    bank = json.loads(bank_path.read_text(encoding="utf-8"))
    if not isinstance(bank, list):
        raise ValueError(f"Expected a JSON list in question bank: {bank_path}")

    counts: dict[str, int] = {}
    for item in bank:
        topic_name = item.get("topic")
        if isinstance(topic_name, str) and topic_name:
            counts[topic_name] = counts.get(topic_name, 0) + 1

    unresolved = []
    for topic in missing:
        count = counts.get(topic["topic"])
        if count is None:
            unresolved.append(topic["topic"])
        else:
            topic["question_count"] = count

    if unresolved:
        raise ValueError(
            "No question_count found in the bank for topic(s): "
            + ", ".join(repr(name) for name in unresolved)
        )

    return subjects


SOURCE_SUBJECTS = apply_question_counts_from_bank(
    parse_subject_material(SUBJECT_MATERIAL),
    QUESTION_BANK_PATH,
)
SOURCE_TOPICS = [
    topic
    for subject in SOURCE_SUBJECTS
    for topic in subject["topics"]
]
TOTAL_SOURCE_QUESTIONS = sum(topic["question_count"] for topic in SOURCE_TOPICS)


def priority_for(question_count: int, max_question_count: int) -> str:
    """Assign relative topic priority from the source question counts."""
    ratio = question_count / max_question_count if max_question_count else 0
    if ratio >= 0.80:
        return "CRITICAL"
    if ratio >= 0.55:
        return "HIGH"
    if ratio >= 0.30:
        return "MEDIUM"
    return "LOW"


def build_prompt() -> str:
    topic_table = [
        {
            "subject": topic["subject"],
            "topic": topic["topic"],
            "question_count": topic["question_count"],
            "subtopics": topic["subtopics"],
        }
        for topic in SOURCE_TOPICS
    ]
    max_count = max((topic["question_count"] for topic in SOURCE_TOPICS), default=0)
    priorities = [
        {
            "subject": topic["subject"],
            "topic": topic["topic"],
            "question_count": topic["question_count"],
            "priority": priority_for(topic["question_count"], max_count),
        }
        for topic in SOURCE_TOPICS
    ]

    return f"""
You are a professional exam-preparation strategist.

Generate a topic-wise study plan and test blueprint as valid JSON only.
The source syllabus below is the closed-world source of truth.

SOURCE TOPICS:
{json.dumps(topic_table, ensure_ascii=False, indent=2)}

PRIORITY GUIDANCE:
{json.dumps(priorities, ensure_ascii=False, indent=2)}

RULES:
1. Include every source topic exactly once, in exactly the source order.
2. Preserve every subject, topic, and subtopic name exactly as supplied.
3. Do not invent, rename, merge, or omit any topic or subtopic.
4. Do not create weeks, months, dates, a calendar, a study duration, or any
   duration field.
5. Each topic must have one FULL_TOPIC_TEST.
6. Create exactly one FULL_TOPIC_TEST per topic. Do not create separate test
   objects for each subtopic; return subtopics as a simple list of strings.
7. Set topic priority using the supplied priority guidance.
8. Use a unique lowercase snake_case topic_id in this exact form:
   "topic_<subject_slug>_<topic_slug>", where each slug is made by lowercasing
   the text and replacing each run of non-alphanumeric characters with "_",
   then trimming "_" from both ends.
9. Topic sequence numbers start at 1 and increase consecutively.
10. The question_count for each topic must equal the source count supplied.
11. Preserve the exact subtopic names and order from the source.
12. Do not invent test questions. The tests will be populated from the existing
    question bank by the application.
13. Output valid JSON only, with no Markdown fences or explanatory text.

OUTPUT SCHEMA:
{{
  "exam": "{EXAM_KEY}",
  "plan_type": "TOPIC_WISE_TESTS",
  "total_topics": <number>,
  "total_subtopics": <number>,
  "source_question_count": <number>,
  "topics": [
    {{
      "topic_id": "topic_example",
      "sequence": 1,
      "subject": "Subject name",
      "topic": "Topic name",
      "question_count": 10,
      "priority": "CRITICAL",
      "test": {{
        "test_type": "FULL_TOPIC_TEST",
        "question_count": 10,
        "source": "question_bank"
      }},
      "subtopics": ["Subtopic name", "Another subtopic"]
    }}
  ]
}}

Return the complete JSON now.
""".strip()


async def call_gemini(prompt: str) -> str:
    """Send the prompt to Gemini and return its response text."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in the backend .env file.")

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 32768,
                    "topP": 0.95,
                    "responseMimeType": "application/json",
                },
            },
        )
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(
            f"Gemini returned no candidates. Feedback: {data.get('promptFeedback', {})}"
        )

    parts = candidates[0].get("content", {}).get("parts", [])
    raw_text = "".join(
        part.get("text", "") for part in parts if "text" in part
    ).strip()
    if not raw_text:
        finish_reason = candidates[0].get("finishReason", "UNKNOWN")
        raise RuntimeError(
            f"Gemini returned an empty response. Finish reason: {finish_reason}"
        )
    return raw_text


def parse_plan_json(raw: str) -> dict:
    """Strip optional Markdown fences and parse the JSON response."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def validate_plan(plan: dict) -> None:
    """Validate structure, order, names, IDs, priorities, and no duration fields."""
    if not isinstance(plan, dict):
        raise ValueError("Plan must be a JSON object.")
    if plan.get("exam") != EXAM_KEY:
        raise ValueError(f"Expected exam={EXAM_KEY!r}, got {plan.get('exam')!r}.")
    if plan.get("plan_type") != "TOPIC_WISE_TESTS":
        raise ValueError("plan_type must be 'TOPIC_WISE_TESTS'.")

    topics = plan.get("topics")
    if not isinstance(topics, list) or len(topics) != len(SOURCE_TOPICS):
        raise ValueError(
            f"Expected {len(SOURCE_TOPICS)} topics, got "
            f"{len(topics) if isinstance(topics, list) else 'invalid topics field'}."
        )
    if plan.get("total_topics") != len(topics):
        raise ValueError("total_topics must equal the number of topic entries.")

    expected_subtopic_total = sum(len(topic["subtopics"]) for topic in SOURCE_TOPICS)
    actual_subtopic_total = sum(
        len(topic.get("subtopics", []))
        for topic in topics
        if isinstance(topic, dict) and isinstance(topic.get("subtopics"), list)
    )
    if plan.get("total_subtopics") != expected_subtopic_total:
        raise ValueError(
            f"total_subtopics must be {expected_subtopic_total}."
        )
    if actual_subtopic_total != expected_subtopic_total:
        raise ValueError(
            f"Expected {expected_subtopic_total} subtopic entries, got {actual_subtopic_total}."
        )
    if plan.get("source_question_count") != TOTAL_SOURCE_QUESTIONS:
        raise ValueError(
            f"source_question_count must be {TOTAL_SOURCE_QUESTIONS}."
        )

    forbidden_fields = {
        "duration", "duration_months", "duration_weeks", "weeks",
        "start_date", "end_date", "calendar",
    }
    if forbidden_fields.intersection(plan):
        raise ValueError("Plan must not contain duration or calendar fields.")

    max_count = max((topic["question_count"] for topic in SOURCE_TOPICS), default=0)
    seen_topic_ids = set()
    valid_priorities = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

    for index, (item, source) in enumerate(zip(topics, SOURCE_TOPICS), start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Topic entry {index} must be an object.")
        if item.get("sequence") != index:
            raise ValueError(f"Expected topic sequence {index}.")

        expected_id = f"topic_{slugify(source['subject'])}_{slugify(source['topic'])}"
        if item.get("topic_id") != expected_id:
            raise ValueError(
                f"Invalid topic_id for {source['topic']!r}; expected {expected_id!r}."
            )
        if item["topic_id"] in seen_topic_ids:
            raise ValueError(f"Duplicate topic_id: {item['topic_id']}")
        seen_topic_ids.add(item["topic_id"])

        if item.get("subject") != source["subject"] or item.get("topic") != source["topic"]:
            raise ValueError(
                f"Topic {index} does not match source order/name: "
                f"expected {source['subject']} / {source['topic']}."
            )
        if item.get("question_count") != source["question_count"]:
            raise ValueError(
                f"Incorrect question_count for {source['topic']!r}; "
                f"expected {source['question_count']}."
            )

        expected_priority = priority_for(source["question_count"], max_count)
        if item.get("priority") != expected_priority or item.get("priority") not in valid_priorities:
            raise ValueError(
                f"Incorrect priority for {source['topic']!r}; expected {expected_priority}."
            )

        if item.get("test", {}).get("test_type") != "FULL_TOPIC_TEST":
            raise ValueError(f"Missing FULL_TOPIC_TEST for {source['topic']!r}.")

        subtopics = item.get("subtopics")
        if not isinstance(subtopics, list) or subtopics != source["subtopics"]:
            raise ValueError(
                f"Subtopic names/order differ from the source for {source['topic']!r}."
            )

    print(
        f"Validated {len(topics)} topics and {expected_subtopic_total} subtopics; "
        "names, order, counts, IDs, priorities, and topic-test types match."
    )


async def upsert_to_db(exam_key: str, plan_text: str) -> Optional[str]:
    """
    Optional database upsert. It does not invent a duration value.
    If the current database model requires duration_months, the upsert is
    refused with an explanation; generated files remain saved.
    """
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL not set in the backend .env file.")

    try:
        from sqlalchemy import inspect, select
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker
        from app.models.quiz import StudyPlanTemplate
    except ImportError as exc:
        raise RuntimeError(f"Database dependencies/model could not be imported: {exc}") from exc

    mapper = inspect(StudyPlanTemplate)
    columns = {column.key: column for column in mapper.columns}
    duration_column = columns.get("duration_months")
    if (
        duration_column is not None
        and not duration_column.nullable
        and duration_column.default is None
        and duration_column.server_default is None
    ):
        raise RuntimeError(
            "StudyPlanTemplate requires duration_months. The generated plan has no "
            "duration, so update the model/database schema to support durationless "
            "templates before enabling this upsert. JSON/TXT files are already saved."
        )

    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with async_session() as session:
            result = await session.execute(
                select(StudyPlanTemplate).where(StudyPlanTemplate.exam == exam_key)
            )
            matches = result.scalars().all()
            if len(matches) > 1:
                raise RuntimeError(
                    f"Found {len(matches)} templates for exam={exam_key!r}. "
                    "Please choose/clean up the existing records before upserting."
                )

            if matches:
                existing = matches[0]
                existing.plan = plan_text
                if duration_column is not None:
                    existing.duration_months = None
                await session.commit()
                return str(existing.id)

            kwargs = {"exam": exam_key, "plan": plan_text}
            if duration_column is not None:
                kwargs["duration_months"] = None
            new_template = StudyPlanTemplate(**kwargs)
            session.add(new_template)
            await session.flush()
            template_id = str(new_template.id)
            await session.commit()
            return template_id
    finally:
        await engine.dispose()


async def main() -> None:
    print("=" * 72)
    print("TOPIC-WISE STUDY PLAN AND TEST GENERATION")
    print("=" * 72)
    print(f"Exam          : {EXAM_KEY}")
    print(f"Subjects      : {len(SOURCE_SUBJECTS)}")
    print(f"Topics        : {len(SOURCE_TOPICS)}")
    print(f"Source questions: {TOTAL_SOURCE_QUESTIONS}")
    print("Duration      : Not used")
    print("Generating plan with Gemini...")

    try:
        raw_response = await call_gemini(build_prompt())
        plan = parse_plan_json(raw_response)
        validate_plan(plan)
    except (httpx.HTTPError, RuntimeError, json.JSONDecodeError, ValueError) as exc:
        print(f"\nERROR: {exc}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    base_name = f"{EXAM_KEY}_topicwise_test_plan"
    json_path = OUTPUT_DIR / f"{base_name}.json"
    txt_path = OUTPUT_DIR / f"{base_name}.txt"

    plan_json = json.dumps(plan, indent=2, ensure_ascii=False)
    json_path.write_text(plan_json + "\n", encoding="utf-8")
    txt_path.write_text(
        f"=== {EXAM_KEY} | Topic-wise tests ===\n{plan_json}\n",
        encoding="utf-8",
    )

    print("\nGenerated plan saved:")
    print(f"  JSON: {json_path}")
    print(f"  TXT : {txt_path}")
    print("\n" + plan_json)

    try:
        answer = input("\nUpsert this plan to the database? [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = "n"
        print()

    if answer == "y":
        try:
            template_id = await upsert_to_db(
                EXAM_KEY, json.dumps(plan, ensure_ascii=False)
            )
            print(f"Database upsert completed. Template ID: {template_id}")
        except Exception as exc:
            print(f"Database upsert failed: {exc}")
            print("The generated JSON and TXT files remain saved.")
    else:
        print("Database upsert skipped.")


if __name__ == "__main__":
    asyncio.run(main())
