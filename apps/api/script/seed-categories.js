import { v4 as uuidv4 } from 'uuid';
import { pool } from '../src/config/database.js';

const seedCategories = async () => {
  const categories = [
    { name: 'Đồ điện tử', slug: 'do-dien-tu', description: 'Điện thoại, laptop, linh kiện...' },
    { name: 'Đồ cổ & Sưu tầm', slug: 'do-co-suu-tam', description: 'Đồng hồ cổ, tiền xu, tem...' },
    { name: 'Thời trang', slug: 'thoi-trang', description: 'Quần áo, túi xách, giày dép...' },
    { name: 'Nghệ thuật', slug: 'nghe-thuat', description: 'Tranh ảnh, điêu khắc, thủ công mỹ nghệ...' },
    { name: 'Khác', slug: 'khac', description: 'Các sản phẩm không thuộc danh mục trên' },
  ];

  try {
    console.log('Seeding categories...');
    
    // Xóa dữ liệu cũ
    await pool.query('DELETE FROM categories');

    for (const cat of categories) {
      await pool.query(
        'INSERT INTO categories (id, name, slug, description) VALUES ($1, $2, $3, $4)',
        [uuidv4(), cat.name, cat.slug, cat.description]
      );
    }
    
    console.log(`✅ Seeded ${categories.length} categories successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
};

seedCategories();
