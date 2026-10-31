from pydantic import BaseModel, Field


class FeedbackInput(BaseModel):
    feedbackId: str = Field(..., description="Unique identifier for the feedback item")
    storeId: str = Field(..., description="Store branch or location identifier")
    text: str = Field(..., description="Raw feedback text provided by customer")
    sourceType: str = Field(default="review", description="Feedback source type (e.g., review, kiosk, survey, app)")
    language: str = Field(default="en", description="Source language hint (e.g., en, te, te-en)")
    createdAt: str | None = Field(default=None, description="ISO timestamp or date string of feedback creation")


class ClassificationResponse(BaseModel):
    feedbackId: str
    storeId: str
    originalText: str
    cleanedText: str
    category: str
    confidence: float
    needsReview: bool
    matchedTerms: list[str]
    severity: str | None = None
    actionable: int | None = None
    ownerFunction: str | None = None
    categoryName: str | None = None
