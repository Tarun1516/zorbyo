# pyright: reportUnknownMemberType=false, reportUnusedCallResult=false
from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


class CertificateService:
    """Generate course completion certificate PDFs."""

    def __init__(self):
        project_root = Path(__file__).resolve().parents[3]
        self.logo_path = project_root / "frontend" / "assets" / "Mini-logo-zorbyo.png"

    def generate_certificate_pdf(
        self,
        user_name: str,
        course_name: str,
        completion_date: datetime,
        certificate_number: str,
    ) -> bytes:
        """Create certificate PDF and return raw bytes."""
        buffer = BytesIO()
        page_width, page_height = landscape(A4)
        pdf = canvas.Canvas(buffer, pagesize=(page_width, page_height))

        # Background and border
        pdf.setFillColorRGB(0.98, 0.99, 1.0)
        pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)
        pdf.setStrokeColor(colors.HexColor("#1F3B73"))
        pdf.setLineWidth(4)
        margin = 24
        pdf.rect(
            margin,
            margin,
            page_width - (margin * 2),
            page_height - (margin * 2),
            fill=0,
            stroke=1,
        )

        # Logo
        logo_width = 120
        logo_height = 48
        if self.logo_path.exists():
            logo = ImageReader(str(self.logo_path))
            pdf.drawImage(
                logo,
                x=(page_width - logo_width) / 2,
                y=page_height - 100,
                width=logo_width,
                height=logo_height,
                preserveAspectRatio=True,
                mask="auto",
            )

        # Heading
        pdf.setFillColor(colors.HexColor("#0E1E4D"))
        pdf.setFont("Helvetica-Bold", 34)
        pdf.drawCentredString(
            page_width / 2, page_height - 150, "Certificate of Completion"
        )

        # Body
        pdf.setFont("Helvetica", 16)
        pdf.drawCentredString(page_width / 2, page_height - 210, "This certifies that")

        pdf.setFont("Helvetica-Bold", 30)
        pdf.setFillColor(colors.HexColor("#11337A"))
        pdf.drawCentredString(page_width / 2, page_height - 255, user_name)

        pdf.setFillColor(colors.HexColor("#0E1E4D"))
        pdf.setFont("Helvetica", 16)
        pdf.drawCentredString(
            page_width / 2,
            page_height - 295,
            "has successfully completed the course",
        )

        pdf.setFont("Helvetica-Bold", 22)
        pdf.setFillColor(colors.HexColor("#11337A"))
        pdf.drawCentredString(page_width / 2, page_height - 330, course_name)

        # Metadata
        formatted_date = completion_date.strftime("%d %B %Y")
        pdf.setFillColor(colors.HexColor("#0E1E4D"))
        pdf.setFont("Helvetica", 14)
        pdf.drawString(80, 90, f"Completion Date: {formatted_date}")
        pdf.drawRightString(
            page_width - 80, 90, f"Certificate No: {certificate_number}"
        )

        pdf.showPage()
        pdf.save()

        buffer.seek(0)
        return buffer.getvalue()


certificate_service = CertificateService()
