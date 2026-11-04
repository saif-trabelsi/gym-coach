from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class LLMError(Exception):
    """Base exception for LLM provider errors."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when request to LLM times out."""
    pass


class LLMRateLimitedError(LLMError):
    """Raised when LLM returns 429 rate limit exceeded."""
    pass


class LLMProviderError(LLMError):
    """Raised when LLM returns an unexpected 5xx or server error."""
    pass


class BaseLLMProvider(ABC):
    @abstractmethod
    def generate(
        self,
        system: str,
        prompt: str,
        language: str,
        stats: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generates text (JSON) given system instruction and user prompt.
        """
        raise NotImplementedError
