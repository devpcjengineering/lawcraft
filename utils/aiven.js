import pg from 'pg';
const { Pool } = pg;

// ดึงค่า AIVEN_PG_URI จาก Environment Variables (ตั้งค่าได้ในไฟล์ .env.local)
// รูปแบบ: postgres://avnadmin:password@host:port/defaultdb?sslmode=require
const AIVEN_PG_URI = process.env.AIVEN_PG_URI;

let pool = null;

/**
 * ฟังก์ชันสำหรับเชื่อมต่อ Aiven PostgreSQL
 */
export function getAivenPool() {
  if (!pool) {
    if (!AIVEN_PG_URI) {
      console.warn('⚠️ ยังไม่ได้ตั้งค่า AIVEN_PG_URI ใน Environment Variables (สำหรับเชื่อมต่อคำพิพากษาศาลฎีกา)');
      return null;
    }
    
    pool = new Pool({
      connectionString: AIVEN_PG_URI,
      // Aiven บังคับใช้การเชื่อมต่อแบบ SSL
      ssl: {
        rejectUnauthorized: false, // เปลี่ยนเป็น true ถ้ามีการระบุ ca (Certificate Authority) ของ Aiven แบบชัดเจน
      },
      max: 10, // จำนวน Connection สูงสุด
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      console.error('❌ Aiven PostgreSQL Pool Error:', err);
    });
  }
  return pool;
}

/**
 * ตัวอย่างฟังก์ชันสำหรับค้นหา "คำพิพากษาศาลฎีกา" จาก Aiven
 * (สามารถนำไปใช้ในฝั่ง Server/API ได้เลย)
 * 
 * @param {string} keyword คำที่ต้องการค้นหา
 * @param {number} limit จำนวนสูงสุดที่ต้องการ
 * @returns {Promise<Array>} รายการคำพิพากษา
 */
export async function searchSupremeCourtDecisions(keyword, limit = 20) {
  const db = getAivenPool();
  if (!db) {
    throw new Error('ยังไม่ได้ตั้งค่า Aiven Database Connection');
  }

  try {
    // หมายเหตุ: โครงสร้าง (Schema) นี้เป็นตัวอย่าง ต้องปรับให้ตรงกับโครงสร้างจริงที่คุณ Import ข้อมูลเข้าไปใน Aiven
    // ตัวอย่างสมมติว่าตารางชื่อ "supreme_court_decisions" และมีคอลัมน์ title, content, year
    const query = `
      SELECT * 
      FROM supreme_court_decisions 
      WHERE content ILIKE $1 OR title ILIKE $1
      ORDER BY year DESC
      LIMIT $2
    `;
    const values = [`%${keyword}%`, limit];
    
    const result = await db.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('❌ Error querying supreme_court_decisions from Aiven:', error);
    throw error;
  }
}
