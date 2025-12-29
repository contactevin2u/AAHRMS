-- Migration: Add mandatory confirmation fields for all clock actions
-- This adds columns to store photo, location, address, and face detection data
-- for each of the 4 clock actions (clock_in_1, clock_out_1, clock_in_2, clock_out_2)

-- Add photo columns for all actions (photo_in_1 already exists)
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS photo_out_1 TEXT,
ADD COLUMN IF NOT EXISTS photo_in_2 TEXT,
ADD COLUMN IF NOT EXISTS photo_out_2 TEXT;

-- Add location columns for all actions (location_in_1 already exists)
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS location_out_1 VARCHAR(100),
ADD COLUMN IF NOT EXISTS location_in_2 VARCHAR(100),
ADD COLUMN IF NOT EXISTS location_out_2 VARCHAR(100);

-- Add address columns for all actions (human-readable addresses)
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS address_in_1 TEXT,
ADD COLUMN IF NOT EXISTS address_out_1 TEXT,
ADD COLUMN IF NOT EXISTS address_in_2 TEXT,
ADD COLUMN IF NOT EXISTS address_out_2 TEXT;

-- Add face detection columns for all actions
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS face_detected_in_1 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS face_detected_out_1 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS face_detected_in_2 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS face_detected_out_2 BOOLEAN DEFAULT FALSE;

-- Add face confidence columns for all actions
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS face_confidence_in_1 DECIMAL(5,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS face_confidence_out_1 DECIMAL(5,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS face_confidence_in_2 DECIMAL(5,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS face_confidence_out_2 DECIMAL(5,4) DEFAULT 0;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_clock_in_records_face_detected
ON clock_in_records (face_detected_in_1, face_detected_out_2);

-- Add comments for documentation
COMMENT ON COLUMN clock_in_records.photo_in_1 IS 'Base64 encoded selfie photo for Start Work action';
COMMENT ON COLUMN clock_in_records.photo_out_1 IS 'Base64 encoded selfie photo for Go on Break action';
COMMENT ON COLUMN clock_in_records.photo_in_2 IS 'Base64 encoded selfie photo for Return from Break action';
COMMENT ON COLUMN clock_in_records.photo_out_2 IS 'Base64 encoded selfie photo for End Work action';

COMMENT ON COLUMN clock_in_records.location_in_1 IS 'GPS coordinates (lat,lng) for Start Work action';
COMMENT ON COLUMN clock_in_records.location_out_1 IS 'GPS coordinates (lat,lng) for Go on Break action';
COMMENT ON COLUMN clock_in_records.location_in_2 IS 'GPS coordinates (lat,lng) for Return from Break action';
COMMENT ON COLUMN clock_in_records.location_out_2 IS 'GPS coordinates (lat,lng) for End Work action';

COMMENT ON COLUMN clock_in_records.address_in_1 IS 'Human-readable address for Start Work action';
COMMENT ON COLUMN clock_in_records.address_out_1 IS 'Human-readable address for Go on Break action';
COMMENT ON COLUMN clock_in_records.address_in_2 IS 'Human-readable address for Return from Break action';
COMMENT ON COLUMN clock_in_records.address_out_2 IS 'Human-readable address for End Work action';

COMMENT ON COLUMN clock_in_records.face_detected_in_1 IS 'Whether face was detected in Start Work selfie';
COMMENT ON COLUMN clock_in_records.face_detected_out_1 IS 'Whether face was detected in Go on Break selfie';
COMMENT ON COLUMN clock_in_records.face_detected_in_2 IS 'Whether face was detected in Return from Break selfie';
COMMENT ON COLUMN clock_in_records.face_detected_out_2 IS 'Whether face was detected in End Work selfie';

COMMENT ON COLUMN clock_in_records.face_confidence_in_1 IS 'Face detection confidence score (0-1) for Start Work';
COMMENT ON COLUMN clock_in_records.face_confidence_out_1 IS 'Face detection confidence score (0-1) for Go on Break';
COMMENT ON COLUMN clock_in_records.face_confidence_in_2 IS 'Face detection confidence score (0-1) for Return from Break';
COMMENT ON COLUMN clock_in_records.face_confidence_out_2 IS 'Face detection confidence score (0-1) for End Work';
