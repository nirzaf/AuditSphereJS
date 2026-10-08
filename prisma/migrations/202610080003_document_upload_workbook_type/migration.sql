-- D13 (DN-01): workbooks reach the Trial Balance import only through the ClamAV-screened
-- upload session. The content type is allowed here, and a workbook may be declared only in the
-- Trial Balance category, so the database enforces the same rule as the service.
ALTER TABLE "DocumentUploadSession" DROP CONSTRAINT "document_upload_content_type_check";

ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "document_upload_content_type_check" CHECK (
  "declaredContentType" IN ('application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
);

ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "document_upload_workbook_category_check" CHECK (
  "declaredContentType" <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  OR category = '02_Trial Balance & Schedules'
);
