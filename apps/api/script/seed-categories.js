import { v4 as uuidv4 } from 'uuid';
import { pool } from '../src/config/database.js';

const seedCategories = async () => {
  const categories = [
    { name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, accessories...' },
    { name: 'Antiques & Collectibles', slug: 'antiques-collectibles', description: 'Vintage watches, coins, stamps...' },
    { name: 'Fashion', slug: 'fashion', description: 'Clothing, bags, shoes...' },
    { name: 'Art', slug: 'art', description: 'Paintings, sculptures, crafts...' },
    { name: 'Other', slug: 'other', description: 'Products not in the above categories' },
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
