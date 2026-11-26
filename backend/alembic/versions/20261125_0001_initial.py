"""initial MarineWatch schema

Revision ID: 20261125_0001
Revises:
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "20261125_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False), sa.Column("email", sa.String(255), nullable=False), sa.Column("hashed_password", sa.String(255), nullable=False), sa.Column("role", sa.String(30), nullable=False, server_default="analyst"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("coastal_zones", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("zone_name", sa.String(150), nullable=False), sa.Column("state", sa.String(100)), sa.Column("country", sa.String(100), nullable=False), sa.Column("description", sa.Text()), sa.Column("boundary", Geometry("POLYGON", srid=4326), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_coastal_zones_zone_name", "coastal_zones", ["zone_name"])
    op.create_table("satellite_images", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("coastal_zone_id", sa.Integer(), sa.ForeignKey("coastal_zones.id", ondelete="CASCADE"), nullable=False), sa.Column("satellite_name", sa.String(100), nullable=False), sa.Column("product_id", sa.String(500), nullable=False), sa.Column("acquisition_date", sa.DateTime(timezone=True), nullable=False), sa.Column("cloud_percentage", sa.Float()), sa.Column("image_path", sa.String(1000)), sa.Column("thumbnail_path", sa.String(1000)), sa.Column("processing_status", sa.String(30), nullable=False, server_default="pending"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_satellite_images_coastal_zone_id", "satellite_images", ["coastal_zone_id"])
    op.create_index("ix_satellite_images_product_id", "satellite_images", ["product_id"], unique=True)
    op.create_table("debris_detections", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("satellite_image_id", sa.Integer(), sa.ForeignKey("satellite_images.id", ondelete="CASCADE"), nullable=False), sa.Column("coastal_zone_id", sa.Integer(), sa.ForeignKey("coastal_zones.id", ondelete="CASCADE"), nullable=False), sa.Column("debris_category", sa.String(100), nullable=False), sa.Column("confidence_score", sa.Float()), sa.Column("detection_status", sa.String(50), nullable=False, server_default="experimental_candidate"), sa.Column("verification_status", sa.String(30), nullable=False, server_default="unverified"), sa.Column("geometry", Geometry("POINT", srid=4326)), sa.Column("latitude", sa.Float(), nullable=False), sa.Column("longitude", sa.Float(), nullable=False), sa.Column("area_estimate", sa.Float()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_debris_detections_satellite_image_id", "debris_detections", ["satellite_image_id"])
    op.create_index("ix_debris_detections_coastal_zone_id", "debris_detections", ["coastal_zone_id"])
    op.create_table("cleanup_reports", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("coastal_zone_id", sa.Integer(), sa.ForeignKey("coastal_zones.id", ondelete="CASCADE"), nullable=False), sa.Column("report_title", sa.String(200), nullable=False), sa.Column("priority_level", sa.String(20), nullable=False), sa.Column("detection_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("recommendations", sa.Text(), nullable=False), sa.Column("report_status", sa.String(30), nullable=False, server_default="draft"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_cleanup_reports_coastal_zone_id", "cleanup_reports", ["coastal_zone_id"])


def downgrade() -> None:
    op.drop_table("cleanup_reports")
    op.drop_table("debris_detections")
    op.drop_table("satellite_images")
    op.drop_table("coastal_zones")
    op.drop_table("users")
