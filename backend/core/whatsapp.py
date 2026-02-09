import httpx
import logging
from backend.core.config import settings

logger = logging.getLogger(__name__)

class WhatsAppClient:
    def __init__(self):
        self.api_token = settings.WHATSAPP_API_TOKEN
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.base_url = f"https://graph.facebook.com/v18.0/{self.phone_number_id}/messages"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    async def send_text_message(self, to: str, body: str, reply_to_message_id: str = None):
        """
        Sends a text message to a user.
        Args:
            to: The recipient's phone number (with country code).
            body: The text of the message.
            reply_to_message_id: Optional. The ID of the message being replied to (context).
        """
        if not self.api_token or not self.phone_number_id:
            logger.error("WhatsApp API credentials not configured.")
            return None

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }

        # If replying, add context. This helps Meta understand it's a conversation.
        if reply_to_message_id:
            payload["context"] = {"message_id": reply_to_message_id}

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.base_url, headers=self.headers, json=payload)
                response.raise_for_status()
                logger.info(f"Message sent to {to}: {response.json()}")
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to send message: {e.response.text}")
                return None
                return None
            except Exception as e:
                logger.error(f"Error sending message: {str(e)}")
                return None

    async def get_media_url(self, media_id: str) -> str:
        """
        Retrieves the temporary download URL for a media object.
        """
        url = f"https://graph.facebook.com/v18.0/{media_id}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                return data.get("url")
            except Exception as e:
                logger.error(f"Error fetching media URL: {e}")
                return None

    async def download_media(self, media_url: str) -> bytes:
        """
        Downloads the media binary content.
        """
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(media_url, headers=self.headers)
                response.raise_for_status()
                return response.content
            except Exception as e:
                logger.error(f"Error downloading media: {e}")
                return None
