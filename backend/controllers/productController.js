const pool = require("../config/db");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (value) =>
  typeof value === "string" && UUID_REGEX.test(value);

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  return Number(value);
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      image_url,
      brand,
      description,
      price,
      discount_price,
      stock,
      flash_sale,
      category_id,
    } = req.body;

    if (
      !name ||
      !image_url ||
      price === undefined ||
      category_id === undefined
    ) {
      return res.status(400).json({
        status: "error",
        message: "name, image_url, price, and category_id are required",
      });
    }

    const numericPrice = Number(price);
    const numericDiscountPrice =
      discount_price === null ||
      discount_price === undefined ||
      discount_price === ""
        ? null
        : Number(discount_price);
    const numericStock =
      stock === undefined || stock === null || stock === "" ? 0 : Number(stock);
    const numericCategoryId = Number(category_id);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        status: "error",
        message: "price must be a valid non-negative number",
      });
    }

    if (
      numericDiscountPrice !== null &&
      (!Number.isFinite(numericDiscountPrice) || numericDiscountPrice < 0)
    ) {
      return res.status(400).json({
        status: "error",
        message: "discount_price must be a valid non-negative number",
      });
    }

    if (numericDiscountPrice !== null && numericDiscountPrice > numericPrice) {
      return res.status(400).json({
        status: "error",
        message: "discount_price cannot be greater than price",
      });
    }

    if (!Number.isInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({
        status: "error",
        message: "stock must be a valid non-negative integer",
      });
    }

    if (!Number.isInteger(numericCategoryId) || numericCategoryId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "category_id must be a valid category id",
      });
    }

    const categoryExists = await pool.query(
      "SELECT id FROM categories WHERE id = $1",
      [numericCategoryId],
    );

    if (categoryExists.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    const existingProduct = await pool.query(
      `SELECT id
       FROM products
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         AND category_id = $2
         AND COALESCE(LOWER(TRIM(brand)), '') = COALESCE(LOWER(TRIM($3)), '')
       LIMIT 1`,
      [name, numericCategoryId, brand || null],
    );

    if (existingProduct.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "This product is already available for users",
      });
    }

    const result = await pool.query(
      `INSERT INTO products
        (name, image_url, brand, description, price, discount_price, stock, flash_sale, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, image_url, brand, description, price, discount_price, stock, flash_sale, category_id`,
      [
        name,
        image_url,
        brand || null,
        description || null,
        numericPrice,
        numericDiscountPrice,
        numericStock,
        Boolean(flash_sale),
        numericCategoryId,
      ],
    );

    const createdProduct = result.rows[0];
    res.status(201).json({
      status: "success",
      message: "Product created successfully",
      data: {
        ...createdProduct,
        price: Number(createdProduct.price),
        discount_price: toNumberOrNull(createdProduct.discount_price),
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to create product",
      error: err.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid product id",
      });
    }

    const existingResult = await pool.query(
      `SELECT id, name, image_url, brand, description, price, discount_price, stock, flash_sale, category_id
       FROM products
       WHERE id = $1`,
      [id],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Product not found",
      });
    }

    const existing = existingResult.rows[0];
    const {
      name,
      image_url,
      brand,
      description,
      price,
      discount_price,
      stock,
      flash_sale,
      category_id,
    } = req.body;

    const nextName = name === undefined ? existing.name : String(name).trim();
    const nextImageUrl =
      image_url === undefined ? existing.image_url : String(image_url).trim();
    const nextBrand =
      brand === undefined ? existing.brand : String(brand || "").trim() || null;
    const nextDescription =
      description === undefined
        ? existing.description
        : String(description || "").trim() || null;
    const nextPrice =
      price === undefined ? Number(existing.price) : Number(price);
    const nextDiscountPrice =
      discount_price === undefined
        ? toNumberOrNull(existing.discount_price)
        : discount_price === null || discount_price === ""
          ? null
          : Number(discount_price);
    const nextStock =
      stock === undefined ? Number(existing.stock) : Number(stock);
    const nextFlashSale =
      flash_sale === undefined
        ? Boolean(existing.flash_sale)
        : Boolean(flash_sale);
    const nextCategoryId =
      category_id === undefined
        ? Number(existing.category_id)
        : Number(category_id);

    if (!nextName || !nextImageUrl) {
      return res.status(400).json({
        status: "error",
        message: "name and image_url are required",
      });
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return res.status(400).json({
        status: "error",
        message: "price must be a valid non-negative number",
      });
    }

    if (
      nextDiscountPrice !== null &&
      (!Number.isFinite(nextDiscountPrice) || nextDiscountPrice < 0)
    ) {
      return res.status(400).json({
        status: "error",
        message: "discount_price must be a valid non-negative number",
      });
    }

    if (nextDiscountPrice !== null && nextDiscountPrice > nextPrice) {
      return res.status(400).json({
        status: "error",
        message: "discount_price cannot be greater than price",
      });
    }

    if (!Number.isInteger(nextStock) || nextStock < 0) {
      return res.status(400).json({
        status: "error",
        message: "stock must be a valid non-negative integer",
      });
    }

    if (!Number.isInteger(nextCategoryId) || nextCategoryId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "category_id must be a valid category id",
      });
    }

    const categoryExists = await pool.query(
      "SELECT id FROM categories WHERE id = $1",
      [nextCategoryId],
    );

    if (categoryExists.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    const duplicateProduct = await pool.query(
      `SELECT id
       FROM products
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         AND category_id = $2
         AND COALESCE(LOWER(TRIM(brand)), '') = COALESCE(LOWER(TRIM($3)), '')
         AND id <> $4
       LIMIT 1`,
      [nextName, nextCategoryId, nextBrand, id],
    );

    if (duplicateProduct.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "This product is already available for users",
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           image_url = $2,
           brand = $3,
           description = $4,
           price = $5,
           discount_price = $6,
           stock = $7,
           flash_sale = $8,
           category_id = $9
       WHERE id = $10
       RETURNING id, name, image_url, brand, description, price, discount_price, stock, flash_sale, category_id`,
      [
        nextName,
        nextImageUrl,
        nextBrand,
        nextDescription,
        nextPrice,
        nextDiscountPrice,
        nextStock,
        nextFlashSale,
        nextCategoryId,
        id,
      ],
    );

    const updatedProduct = result.rows[0];
    res.json({
      status: "success",
      message: "Product updated successfully",
      data: {
        ...updatedProduct,
        price: Number(updatedProduct.price),
        discount_price: toNumberOrNull(updatedProduct.discount_price),
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to update product",
      error: err.message,
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid product id",
      });
    }

    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id, name",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Product not found",
      });
    }

    res.json({
      status: "success",
      message: "Product deleted successfully",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete product",
      error: err.message,
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      flash_sale,
      trending,
      category,
      search,
      sort,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (pageNum - 1) * limitNum;
    const params = [];
    let paramCount = 1;

    let query = `
            SELECT 
                p.id,
                p.name,
                p.image_url,
              p.brand,
              p.description,
                p.price,
                p.discount_price,
                p.stock,
                p.flash_sale,
                p.category_id,
                c.name as category_name,
                ROUND(AVG(oi.rating), 2) as rating,
                COUNT(oi.id) as review_count,
                COALESCE((
                  SELECT SUM(oi_total.quantity)
                  FROM order_items oi_total
                  JOIN orders o_total ON oi_total.order_id = o_total.id
                  WHERE oi_total.product_id = p.id AND o_total.order_status IN ('Paid', 'Confirmed', 'Delivered')
                ), 0) as sold_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN order_items oi ON p.id = oi.product_id AND oi.rating IS NOT NULL
            WHERE 1=1
        `;

    if (search) {
      query += ` AND p.name ILIKE $${paramCount}`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (flash_sale === "true") {
      query += ` AND p.flash_sale = TRUE`;
    }

    if (category) {
      const categoryTokens = category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const categoryIds = categoryTokens
        .map((c) => parseInt(c, 10))
        .filter((id) => !isNaN(id));

      const categoryNames = categoryTokens
        .filter((c) => isNaN(parseInt(c, 10)))
        .map((c) => c.toLowerCase());

      if (categoryIds.length > 0 && categoryNames.length > 0) {
        query += ` AND (p.category_id = ANY($${paramCount}::int[]) OR LOWER(c.name) = ANY($${paramCount + 1}::text[]))`;
        params.push(categoryIds, categoryNames);
        paramCount += 2;
      } else if (categoryIds.length > 0) {
        query += ` AND p.category_id = ANY($${paramCount}::int[])`;
        params.push(categoryIds);
        paramCount++;
      } else if (categoryNames.length > 0) {
        query += ` AND LOWER(c.name) = ANY($${paramCount}::text[])`;
        params.push(categoryNames);
        paramCount++;
      }
    }

    query += ` GROUP BY p.id, p.name, p.image_url, p.brand, p.description, p.price, p.discount_price, p.stock, p.flash_sale, p.category_id, c.name`;

    if (trending === "true") {
      query += ` ORDER BY rating DESC NULLS LAST`;
    } else {
      switch (sort) {
        case "price_asc":
          query += ` ORDER BY p.price ASC`;
          break;
        case "price_desc":
          query += ` ORDER BY p.price DESC`;
          break;
        case "rating_desc":
          query += ` ORDER BY rating DESC NULLS LAST`;
          break;
        default:
          query += ` ORDER BY p.name ASC`;
      }
    }

    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limitNum, offset);

    let countQuery = `
            SELECT COUNT(DISTINCT p.id) 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
    const countParams = [];
    let countParamCount = 1;

    if (search) {
      countQuery += ` AND p.name ILIKE $${countParamCount}`;
      countParams.push(`%${search}%`);
      countParamCount++;
    }
    if (flash_sale === "true") countQuery += ` AND p.flash_sale = TRUE`;
    if (category) {
      const categoryTokens = category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const categoryIds = categoryTokens
        .map((c) => parseInt(c, 10))
        .filter((id) => !isNaN(id));

      const categoryNames = categoryTokens
        .filter((c) => isNaN(parseInt(c, 10)))
        .map((c) => c.toLowerCase());

      if (categoryIds.length > 0 && categoryNames.length > 0) {
        countQuery += ` AND (p.category_id = ANY($${countParamCount}::int[]) OR LOWER(c.name) = ANY($${countParamCount + 1}::text[]))`;
        countParams.push(categoryIds, categoryNames);
        countParamCount += 2;
      } else if (categoryIds.length > 0) {
        countQuery += ` AND p.category_id = ANY($${countParamCount}::int[])`;
        countParams.push(categoryIds);
        countParamCount++;
      } else if (categoryNames.length > 0) {
        countQuery += ` AND LOWER(c.name) = ANY($${countParamCount}::text[])`;
        countParams.push(categoryNames);
      }
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const total_items = parseInt(countResult.rows[0].count, 10);
    const normalizedRows = result.rows.map((row) => ({
      ...row,
      price: Number(row.price),
      discount_price: toNumberOrNull(row.discount_price),
      rating: toNumberOrNull(row.rating),
      review_count: Number(row.review_count || 0),
      sold_count: Number(row.sold_count || 0),
    }));

    res.json({
      status: "success",
      data: normalizedRows,
      meta: {
        total_items,
        total_pages: Math.ceil(total_items / limitNum),
        current_page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve products",
      error: err.message,
    });
  }
};

// Get single product with reviews
const getProductWithReviews = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid product id",
      });
    }

    // Get product details
    const productResult = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [id],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Product not found",
      });
    }

    const product = productResult.rows[0];

    // Get product reviews with user info
    const reviewsResult = await pool.query(
      `SELECT 
                oi.id,
                oi.rating,
                oi.review,
                oi.review_date as created_at,
                u.name as user_name
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN users u ON o.user_id = u.id
            WHERE oi.product_id = $1 AND oi.rating IS NOT NULL
            ORDER BY oi.review_date DESC`,
      [id],
    );

    // Get average rating
    const ratingResult = await pool.query(
      `SELECT 
                ROUND(AVG(oi.rating), 2) as avg_rating,
                COUNT(oi.id) as review_count
            FROM order_items oi
            WHERE oi.product_id = $1 AND oi.rating IS NOT NULL`,
      [id],
    );

    // Get total sold quantity
    const soldResult = await pool.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.product_id = $1 AND o.order_status IN ('Paid', 'Confirmed', 'Delivered')`,
      [id],
    );

    const { avg_rating, review_count } = ratingResult.rows[0];
    const { total_sold } = soldResult.rows[0];
    const normalizedProduct = {
      ...product,
      price: Number(product.price),
      discount_price: toNumberOrNull(product.discount_price),
    };
    const normalizedReviews = reviewsResult.rows.map((r) => ({
      ...r,
      rating: Number(r.rating),
    }));

    // Combine all data
    const response = {
      status: "success",
      data: {
        ...normalizedProduct,
        rating: {
          avg: toNumberOrNull(avg_rating) ?? 0,
          total_reviews: Number(review_count || 0),
        },
        total_sold: Number(total_sold || 0),
        reviews: normalizedReviews,
      },
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve product details",
      error: err.message,
    });
  }
};

const getProductCategories = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM categories ORDER BY name",
    );

    res.json({
      status: "success",
      data: result.rows.map((row) => ({ id: row.id, name: row.name })),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve categories",
      error: err.message,
    });
  }
};

const getTrendingProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
                p.id,
                p.name,
                p.image_url,
            p.brand,
            p.description,
                p.price,
                p.discount_price,
                p.stock,
                p.flash_sale,
                p.category_id,
                c.name as category_name,
                ROUND(AVG(oi.rating), 2) as rating
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN order_items oi ON p.id = oi.product_id AND oi.rating IS NOT NULL
          GROUP BY p.id, p.name, p.image_url, p.brand, p.description, p.price, p.discount_price, p.stock, p.flash_sale, p.category_id, c.name
            ORDER BY rating DESC NULLS LAST
            LIMIT 10`,
    );

    res.json({
      status: "success",
      data: result.rows.map((row) => ({
        ...row,
        price: Number(row.price),
        discount_price: toNumberOrNull(row.discount_price),
        rating: toNumberOrNull(row.rating),
      })),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve trending products",
      error: err.message,
    });
  }
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  getProductWithReviews,
  getProductCategories,
  getTrendingProducts,
};
