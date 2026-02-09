import os
import glob
from docx import Document

def convert_docx_to_text(docx_path):
    try:
        doc = Document(docx_path)
        full_text = []
        for para in doc.paragraphs:
            full_text.append(para.text)
        return '\n'.join(full_text)
    except Exception as e:
        print(f"Error reading {docx_path}: {e}")
        return None

def main():
    docx_files = glob.glob("*.docx")
    print(f"Found {len(docx_files)} .docx files.")
    
    for file_path in docx_files:
        print(f"Processing: {file_path}")
        text_content = convert_docx_to_text(file_path)
        
        if text_content:
            txt_filename = os.path.splitext(file_path)[0] + ".txt"
            with open(txt_filename, "w", encoding="utf-8") as f:
                f.write(text_content)
            print(f"Saved text to: {txt_filename}")
        else:
            print(f"Failed to extract text from {file_path}")

if __name__ == "__main__":
    main()
