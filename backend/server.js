
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const db = require('./db');

const app = express();
app.get('/test-server', (req, res) => {
    res.send('Updated FoodExpress server is running!');
});

app.use(express.json());

app.use(cors({
    origin: 'http://127.0.0.1:5501',
    credentials: true
}));

app.use(session({
    name: 'foodexpress_admin_session',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Local development only (HTTP)
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000
    }
}));
// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Please enter email and password'
            });
        }

        if (
            !process.env.ADMIN_EMAIL ||
            !process.env.ADMIN_PASSWORD_HASH ||
            !process.env.SESSION_SECRET
        ) {
            return res.status(500).json({
                message: 'Admin authentication is not configured'
            });
        }

        const isEmailValid =
            email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

        const isPasswordValid = await bcrypt.compare(
            password,
            process.env.ADMIN_PASSWORD_HASH
        );

        if (!isEmailValid || !isPasswordValid) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({
                    message: 'Unable to create admin session'
                });
            }

            req.session.isAdmin = true;

            req.session.save((saveError) => {
                if (saveError) {
                    return res.status(500).json({
                        message: 'Unable to save admin session'
                    });
                }

                return res.json({
                    message: 'Admin login successful'
                });
            });
        });

    } catch (error) {
        console.error('Admin login error:', error);

        res.status(500).json({
            message: 'Login failed'
        });
    }
});

// Admin authentication middleware
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) {
        return next();
    }

    return res.status(401).json({
        message: 'Unauthorized. Please login as admin.'
    });
}

// Check whether admin is logged in
app.get('/api/admin/session', requireAdmin, (req, res) => {
    res.json({
        authenticated: true
    });
});

// Admin logout
app.post('/api/admin/logout', requireAdmin, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: 'Logout failed'
            });
        }

        res.clearCookie('foodexpress_admin_session');

        res.json({
            message: 'Logged out successfully'
        });
    });
});

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const orders = [
    {
        orderId: "FE1001",
        name: "Poojitha",
        mobile: "9876543210",
        email: "poojitha@gmail.com",
        address: "Hyderabad",
        
        items: [
            {
                id: 4,
                name: "Chicken Burger",
                price: 249,
                qty: 1
            },
            {
                id: 1,
                name: "Margherita Pizza",
                price: 299,
                qty: 1
            }
        ],

        totals: {
            subtotal: 548,
            discount: 0,
            delivery: 0,
            tax: 27,
            total: 575
        },

        paymentMethod: "Demo",
        paymentStatus: "Pending",
        status: "Order Placed",
        createdAt: new Date().toISOString()
    }
];

// Protect all admin routes
app.use('/admin', requireAdmin);
// Available delivery persons
const deliveryPersons = [
    {
        id: 1,
        name: "Rahul Kumar",
        mobile: "9876543210"
    },
    {
        id: 2,
        name: "Suresh Reddy",
        mobile: "9876543211"
    },
    {
        id: 3,
        name: "Arjun Sharma",
        mobile: "9876543212"
    }
];

const productCatalog = [
    { id: 1, name: "Margherita Pizza", price: 1},
    { id: 2, name: "Pepperoni Pizza", price: 399 },
    { id: 3, name: "Classic Burger", price: 199 },
    { id: 4, name: "Chicken Burger", price: 249 },
    { id: 5, name: "Hyderabadi Biryani", price: 349 },
    { id: 6, name: "Veg Biryani", price: 279 },
    { id: 7, name: "Organic Bananas", price: 59 },
    { id: 8, name: "Whole Milk 1L", price: 68 },
    { id: 9, name: "Chocolate Brownie", price: 89 },
    { id: 10, name: "Ice Cream Sundae", price: 149 },
    { id: 11, name: "Farm Eggs (6 pack)", price: 79 },
    { id: 12, name: "Sourdough Bread", price: 129 }
];

const backendCoupons = {
    WELCOME50: { type: 'flat', value: 50, min: 199 },
    FOOD100: { type: 'flat', value: 100, min: 499 },
    SAVE10: { type: 'percent', value: 10, min: 299, maxDiscount: 80 }
};

function calculateOrderTotals(items, couponCode = null) {

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Cart is empty or invalid');
    }

    let subtotal = 0;
    const verifiedItems = [];

    for (const item of items) {

        const product = productCatalog.find(
            p => p.id === Number(item.id)
        );

        if (!product) {
            throw new Error(`Invalid product ID: ${item.id}`);
        }

        const quantity = Number(item.qty);

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            throw new Error('Invalid product quantity');
        }

        subtotal += product.price * quantity;

        verifiedItems.push({
            id: product.id,
            name: product.name,
            price: product.price,
            qty: quantity
        });
    }

    let discount = 0;

    if (couponCode) {
        const coupon = backendCoupons[couponCode];

        if (!coupon) {
            throw new Error('Invalid coupon code');
        }

        if (subtotal < coupon.min) {
            throw new Error('Minimum order amount not reached for coupon');
        }

        if (coupon.type === 'flat') {
            discount = coupon.value;
        } else if (coupon.type === 'percent') {
            discount = Math.min(
                Math.round(subtotal * coupon.value / 100),
                coupon.maxDiscount
            );
        }
    }

    const delivery = 0;
    const tax = Math.round((subtotal - discount) * 0.05);
    const total = Math.max(0, subtotal - discount) + delivery + tax;

    return {
        items: verifiedItems,
        totals: {
            subtotal,
            discount,
            delivery,
            tax,
            total
        }
    };
}
const pendingPayments = new Map();


// Store recent OTP requests to prevent repeated requests
const otpRequests = new Map();

// Send OTP using MSG91
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        let { mobile } = req.body;

        // Validate mobile number
        mobile = String(mobile || '').trim();

        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({
                message: 'Please enter a valid 10-digit Indian mobile number'
            });
        }

        // Check MSG91 configuration
        if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
            return res.status(500).json({
                message: 'MSG91 configuration is missing'
            });
        }

        // Prevent repeated OTP requests within 60 seconds
        const lastRequest = otpRequests.get(mobile);

        if (lastRequest && Date.now() - lastRequest < 60000) {
            return res.status(429).json({
                message: 'Please wait 60 seconds before requesting another OTP'
            });
        }

        // MSG91 requires the country code
        const mobileWithCountryCode = `91${mobile}`;

        const params = new URLSearchParams({
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile: mobileWithCountryCode,
            otp_length: '6',
            otp_expiry: '5'
        });

        const response = await fetch(
            `https://control.msg91.com/api/v5/otp?${params}`,
            {
                method: 'POST',
                headers: {
                    authkey: process.env.MSG91_AUTH_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            }
        );

        const data = await response.json();

        if (!response.ok || data.type !== 'success') {
            console.error('MSG91 error:', data);

            return res.status(502).json({
                message: 'Unable to send OTP. Please check MSG91 configuration.'
            });
        }

        // Save request time only after successful OTP request
        otpRequests.set(mobile, Date.now());

        return res.status(200).json({
            message: 'OTP sent successfully',
            requestId: data.request_id
        });

    } catch (error) {
        console.error('Send OTP error:', error);

        return res.status(500).json({
            message: 'Something went wrong while sending OTP'
        });
    }
});


app.get('/', (req, res) => {
    res.send('Welcome to FoodExpress Backend!');
});

// Get available delivery persons
app.get('/admin/delivery-persons', (req, res) => {
    res.json({
        deliveryPersons: deliveryPersons
    });
});


function formatOrder(row) {
    const parseJSON = (value, fallback) => {
        if (!value) return fallback;
        if (typeof value === 'object') return value;

        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    return {
        orderId: row.order_id,
        name: row.customer_name,
        mobile: row.mobile,
        email: row.email,
        address: row.address,
        city: row.city,
        pin: row.pin,
        addressType: row.address_type,
        instructions: row.instructions,
        slot: row.slot,

        items: parseJSON(row.items, []),

        totals: {
            subtotal: Number(row.subtotal),
            discount: Number(row.discount || 0),
            delivery: Number(row.delivery_fee || 0),
            tax: Number(row.tax || 0),
            total: Number(row.total)
        },

        coupon: row.coupon,
        paymentMethod: row.payment_method,
        paymentId: row.payment_id,
        paymentStatus: row.payment_status,
        status: row.order_status,
        createdAt: row.created_at,

        deliveryPerson: parseJSON(row.delivery_person, null)
    };
}

// Get all orders for Admin Dashboard


app.get('/admin/orders', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM orders ORDER BY id DESC'
        );

        const formattedOrders = rows.map(formatOrder);

        return res.status(200).json({
            message: 'Orders retrieved successfully',
            totalOrders: formattedOrders.length,
            orders: formattedOrders
        });

    } catch (error) {
        console.error('Admin orders error:', error);

        return res.status(500).json({
            message: 'Unable to retrieve orders'
        });
    }
});


app.get('/orders/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const [rows] = await db.execute(
            'SELECT * FROM orders WHERE order_id = ? LIMIT 1',
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: 'Order not found'
            });
        }

        const foundOrder = formatOrder(rows[0]);

        return res.status(200).json(foundOrder);

    } catch (error) {
        console.error('Tracking order error:', error);

        return res.status(500).json({
            message: 'Unable to retrieve order'
        });
    }
});



app.put('/orders/:orderId', requireAdmin, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const newStatus = req.body.status;

        const validStatuses = [
            "Order Placed",
            "Order Confirmed",
            "Rejected",
            "Preparing",
            "Packed",
            "Picked Up",
            "Out for Delivery",
            "Delivered"
        ];

        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({
                message: "Please provide a valid order status"
            });
        }

        // Check whether the order exists in MySQL
        const [existingOrders] = await db.execute(
            'SELECT order_id FROM orders WHERE order_id = ? LIMIT 1',
            [orderId]
        );

        if (existingOrders.length === 0) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // Update order status in MySQL
        await db.execute(
            'UPDATE orders SET order_status = ? WHERE order_id = ?',
            [newStatus, orderId]
        );

        // Get updated order
        const [rows] = await db.execute(
            'SELECT * FROM orders WHERE order_id = ? LIMIT 1',
            [orderId]
        );

        return res.json({
            message: "Order status updated successfully",
            order: formatOrder(rows[0])
        });

    } catch (error) {
        console.error("Order status update error:", error);

        return res.status(500).json({
            message: "Unable to update order status"
        });
    }
});


app.post('/orders',(req,res)=>{
    const orderData = req.body;
    if (!orderData.customerName || !orderData.mobile || !orderData.products) {
    return res.status(400).json({
        message: "Please provide all required order details"
    });
}
    const orderId = `FE${Date.now()}`;
    const  details = {...orderData,
    orderId:orderId,
    status:"Order Placed"
    };
    orders.push(details)
     res.status(201).json({
        message: "Order created successfully",
        order: details
    });
})

app.delete('/orders/:orderId',requireAdmin, (req, res) => {

    // Get Order ID from URL
    const orderId = req.params.orderId;

    // Find the order index
    const orderIndex = orders.findIndex(
        order => order.orderId === orderId
    );

    // Check if order exists
    if (orderIndex === -1) {
        return res.status(404).json({
            message: "Order not found"
        });
    }

    // Delete the order
    const deletedOrder = orders.splice(orderIndex, 1);

    // Send response
    res.json({
        message: "Order deleted successfully",
        order: deletedOrder[0]
    });

});


app.post('/api/create-cod-order', async (req, res) => {
    try {
        const { customer, items, coupon } = req.body;

        // Validate customer details
        if (
            !customer ||
            !customer.name ||
            !customer.mobile ||
            !customer.address ||
            !customer.city ||
            !customer.pin
        ) {
            return res.status(400).json({
                message: 'Please provide all required customer details'
            });
        }

        // Validate mobile number
        if (!/^[6-9]\d{9}$/.test(String(customer.mobile))) {
            return res.status(400).json({
                message: 'Invalid mobile number'
            });
        }

        // Calculate totals using trusted backend prices
        const calculatedOrder = calculateOrderTotals(
            items,
            coupon || null
        );

        const { items: verifiedItems, totals } = calculatedOrder;

        // Generate FoodExpress Order ID
        const orderId = `FE${Date.now()}`;

        const newOrder = {
            orderId,
            name: customer.name,
            mobile: customer.mobile,
            email: customer.email || '',
            address: customer.address,
            city: customer.city,
            pin: customer.pin,
            addressType: customer.addressType || '',
            instructions: customer.instructions || '',
            slot: customer.slot || '',
            items: verifiedItems,
            totals,
            coupon: coupon || null,
            paymentMethod: 'COD',
            paymentStatus: 'Pending',
            status: 'Order Placed',
            createdAt: new Date().toISOString()
        };

        // Save order permanently in MySQL
        await db.execute(
            `INSERT INTO orders (
                order_id,
                customer_name,
                mobile,
                email,
                address,
                city,
                pin,
                items,
                subtotal,
                discount,
                delivery_fee,
                tax,
                total,
                coupon,
                address_type,
                instructions,
                slot,
                payment_method,
                payment_status,
                    order_status,
                   created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                orderId,
                newOrder.name,
                newOrder.mobile,
                newOrder.email,
                newOrder.address,
                newOrder.city,
                newOrder.pin,
                JSON.stringify(newOrder.items),
                totals.subtotal,
                totals.discount,
                totals.delivery,
                totals.tax,
                totals.total,
                newOrder.coupon,
                newOrder.addressType,
                newOrder.instructions,
                newOrder.slot,
                newOrder.paymentMethod,
                newOrder.paymentStatus,
                newOrder.status
            ]
        );

        return res.status(201).json({
            message: 'COD order created successfully',
            order: newOrder
        });

    } catch (error) {
        console.error('COD order creation error:', error);

        return res.status(500).json({
            message: error.message || 'Unable to create COD order'
        });
    }
});


app.post('/api/create-razorpay-order', async (req, res) => {
    try {
        const { items, coupon } = req.body;

        // Calculate the total using backend product prices
        let calculatedOrder;

        try {
            calculatedOrder = calculateOrderTotals(items, coupon || null);
        } catch (error) {
            return res.status(400).json({
                message: error.message
            });
        }

        const { items: verifiedItems, totals } = calculatedOrder;

        // Create Razorpay order using backend-calculated amount
        const options = {
            amount: totals.total * 100,
            currency: 'INR',
            receipt: `receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        // Store trusted order details temporarily
        pendingPayments.set(order.id, {
            items: verifiedItems,
            totals,
            coupon: coupon || null,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            totals
        });

    } catch (error) {
        console.error('Razorpay order creation error:', error);

        res.status(500).json({
            message: 'Unable to create Razorpay order'
        });
    }
});


app.post('/api/verify-payment', async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            customer
        } = req.body;

        // 1. Validate payment details
        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                message: 'Missing payment details'
            });
        }

        // 2. Prevent duplicate orders
        const existingOrder = orders.find(
            order => order.paymentId === razorpay_payment_id
        );

        if (existingOrder) {
            return res.status(200).json({
                message: 'Order already exists for this payment',
                order: existingOrder
            });
        }

        // 3. Get trusted order details from backend storage
        const pendingOrder = pendingPayments.get(razorpay_order_id);

        if (!pendingOrder) {
            return res.status(400).json({
                message: 'Pending payment not found or expired'
            });
        }

        // 4. Validate customer details
        if (
            !customer ||
            typeof customer !== 'object' ||
            Array.isArray(customer) ||
            !customer.name ||
            !customer.mobile ||
            !customer.address
        ) {
            return res.status(400).json({
                message: 'Invalid customer details'
            });
        }

        // 5. Generate expected payment signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        // 6. Compare signatures securely
        const expected = Buffer.from(expectedSignature, 'hex');
        const received = Buffer.from(razorpay_signature, 'hex');

        const isValid =
            /^[a-f0-9]{64}$/i.test(razorpay_signature) &&
            expected.length === received.length &&
            crypto.timingSafeEqual(expected, received);

        if (!isValid) {
            return res.status(400).json({
                message: 'Payment verification failed'
            });
        }

        // 7. Fetch payment details directly from Razorpay
        const payment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        const razorpayOrder = await razorpay.orders.fetch(
            razorpay_order_id
        );

        // 8. Verify the actual paid amount against backend totals
        const expectedAmount = pendingOrder.totals.total * 100;

        if (
            payment.order_id !== razorpay_order_id ||
            payment.status !== 'captured' ||
            payment.amount !== expectedAmount ||
            razorpayOrder.amount !== expectedAmount ||
            payment.currency !== 'INR' ||
            razorpayOrder.currency !== 'INR'
        ) {
            return res.status(400).json({
                message: 'Payment amount or payment details do not match'
            });
        }

        // 9. Generate FoodExpress Order ID after successful verification
        const orderId = `FE${Date.now()}`;

        // 10. Create order using trusted backend product and price details
        const newOrder = {
            name: customer.name,
            mobile: customer.mobile,
            email: customer.email || '',
            address: customer.address,
            addressType: customer.addressType || '',
            instructions: customer.instructions || '',
            slot: customer.slot || '',

            items: pendingOrder.items,
            totals: pendingOrder.totals,
            coupon: pendingOrder.coupon,

            orderId,
            paymentMethod: 'Razorpay',
            paymentId: razorpay_payment_id,
            paymentStatus: 'Paid',
            status: 'Order Placed',
            createdAt: new Date().toISOString()
        };

        // 11. Save order
        orders.push(newOrder);

        // Remove completed payment from pending storage
        pendingPayments.delete(razorpay_order_id);

        // 12. Send successful response
        return res.status(201).json({
            message: 'Payment verified and order created successfully',
            order: newOrder
        });

    } catch (error) {
        console.error('Payment verification error:', error);

        return res.status(500).json({
            message: 'Payment verification failed'
        });
    }
});


app.put(
    "/orders/:orderId/assign-delivery-person",
    requireAdmin,
    async (req, res) => {
        try {
            const { orderId } = req.params;
            const { deliveryPersonId } = req.body;

            // Find the selected delivery person
            const person = deliveryPersons.find(
                item => item.id === Number(deliveryPersonId)
            );

            if (!person) {
                return res.status(404).json({
                    message: "Delivery person not found"
                });
            }

            // Check whether the order exists in MySQL
            const [existingOrders] = await db.execute(
                'SELECT order_id FROM orders WHERE order_id = ? LIMIT 1',
                [orderId]
            );

            if (existingOrders.length === 0) {
                return res.status(404).json({
                    message: "Order not found"
                });
            }

            // Save delivery person in MySQL
            const assignedPerson = {
                id: person.id,
                name: person.name,
                mobile: person.mobile
            };

            await db.execute(
                `UPDATE orders
                 SET delivery_person = ?
                 WHERE order_id = ?`,
                [JSON.stringify(assignedPerson), orderId]
            );

            // Retrieve updated order
            const [rows] = await db.execute(
                'SELECT * FROM orders WHERE order_id = ? LIMIT 1',
                [orderId]
            );

            return res.json({
                message: "Delivery person assigned successfully",
                order: formatOrder(rows[0])
            });

        } catch (error) {
            console.error('Delivery assignment error:', error);

            return res.status(500).json({
                message: "Unable to assign delivery person"
            });
        }
    }
);

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       