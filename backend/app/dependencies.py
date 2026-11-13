import uuid
from typing import Optional
from fastapi import Header, HTTPException, status


def get_device_id(
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
) -> str:
    """
    Extracts and validates the X-Device-Id header as a UUID v4.
    Missing or invalid header format results in 400 Bad Request.
    """
    if not x_device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Device-Id header",
        )

    try:
        parsed = uuid.UUID(str(x_device_id).strip(), version=4)
        return str(parsed)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Device-Id header. Must be a valid UUID v4.",
        )
