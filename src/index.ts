import express, { Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { authenticate, isAdmin, AuthRequest } from './middleware';

const app = express();

// Allow requests from your Vercel frontend (or localhost during development)
app.use(cors());


app.use(express.json());

const JWT_SECRET = 'super-secret-key';

// --- AUTH ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { fullName, studentId, email, password, department } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { fullName, studentId, email, password: hashedPassword, department, role: 'STUDENT' },
    });
    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- STUDENT ROUTES ---
app.get('/api/profile', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user?.id },
    select: { id: true, fullName: true, email: true, studentId: true, department: true, role: true }
  });
  res.json(user);
});

app.get('/api/equipment', authenticate, async (req: Request, res: Response) => {
  const { category } = req.query;
  const whereClause = category && category !== 'All' ? { category: String(category) } : {};
  const equipment = await prisma.equipment.findMany({ where: whereClause });
  res.json(equipment);
});

app.post('/api/tickets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { equipmentId, customEquip, description, priority, imageUrl } = req.body;
    
    let realEquipmentId = null;
    if (equipmentId && equipmentId !== 'other') {
      let equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
      if (!equipment) {
        equipment = await prisma.equipment.findUnique({ where: { code: equipmentId } });
      }
      if (equipment) {
        realEquipmentId = equipment.id;
      } else {
        return res.status(400).json({ error: `Equipment not found.` });
      }
    }

    const count = await prisma.ticket.count();
    const ticketNumber = `#REQ-2026-${String(count + 1).padStart(3, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber, 
        userId: req.user!.id, 
        equipmentId: realEquipmentId,
        customEquip, 
        description, 
        priority, 
        imageUrl, 
        status: 'PENDING'
      }
    });
    
    res.status(201).json(ticket);
  } catch (error: any) {
    console.log("!!! TICKET FAILED !!!", error.message);
    res.status(500).json({ error: 'Failed to create ticket', details: error.message });
  }
});

app.get('/api/tickets/my', authenticate, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const whereClause: any = { userId: req.user!.id };
  if (status && status !== 'All') whereClause.status = String(status).toUpperCase().replace(' ', '_');
  
  const tickets = await prisma.ticket.findMany({
    where: whereClause, include: { equipment: true }, orderBy: { createdAt: 'desc' }
  });
  res.json(tickets);
});

app.get('/api/history', authenticate, async (req: AuthRequest, res: Response) => {
  const history = await prisma.ticket.findMany({
    where: { userId: req.user!.id, status: 'COMPLETED' },
    include: { equipment: true }, orderBy: { updatedAt: 'desc' }
  });
  res.json(history);
});

app.get('/api/schedule', authenticate, async (req: Request, res: Response) => {
  const schedules = await prisma.maintenanceSchedule.findMany({ orderBy: { date: 'asc' } });
  res.json(schedules);
});

// --- ADMIN ROUTES ---
app.get('/api/admin/dashboard', authenticate, isAdmin, async (req: Request, res: Response) => {
  const [total, pending, inProgress, completed] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: 'PENDING' } }),
    prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.ticket.count({ where: { status: 'COMPLETED' } }),
  ]);
  const recentRequests = await prisma.ticket.findMany({
    take: 5, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } }, equipment: true }
  });
  res.json({ stats: { total, pending, inProgress, completed }, recentRequests });
});

app.patch('/api/admin/tickets/:id', authenticate, isAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status, cost, assignedTo } = req.body; 
  
  const updatedTicket = await prisma.ticket.update({ 
    where: { id }, 
    data: { status, cost, assignedTo } 
  });
  res.json(updatedTicket);
});

app.get('/api/admin/users', authenticate, isAdmin, async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true }
  });
  res.json(users);
});

app.get('/api/admin/history', authenticate, isAdmin, async (req: Request, res: Response) => {
  const history = await prisma.ticket.findMany({
    where: { status: 'COMPLETED' },
    include: { user: { select: { fullName: true } }, equipment: true },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(history);
});

// --- SEED ---
app.post('/api/seed', async (req, res) => {
  await prisma.ticket.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.maintenanceSchedule.deleteMany();

  const pass = await bcrypt.hash('password123', 10);

  await prisma.user.create({
    data: { fullName: 'Juan dela Cruz', email: 'juan@example.com', password: pass, studentId: 'BSTT 2A', role: 'STUDENT' }
  });
  await prisma.user.create({
    data: { fullName: 'Admin User', email: 'admin@example.com', password: pass, role: 'ADMIN' }
  });

  await prisma.equipment.createMany({
    data: [
      { name: 'Desktop Computer', code: 'EQP-001', category: 'Computers', status: 'IN_USE', lastMaintenance: new Date('2026-03-15') },
      { name: 'Projector', code: 'EQP-002', category: 'Projectors', status: 'AVAILABLE', lastMaintenance: new Date('2026-02-10') },
      { name: 'Air Conditioner', code: 'EQP-003', category: 'HVAC', status: 'NEEDS_REPAIR', lastMaintenance: new Date('2026-01-25') },
      { name: 'Printer', code: 'EQP-004', category: 'Others', status: 'IN_USE', lastMaintenance: new Date('2026-03-05') },
    ]
  });

  await prisma.maintenanceSchedule.createMany({
    data: [
      { title: 'Computer Lab Cleaning', date: new Date('2026-12-05'), time: '9:00 AM', location: 'Lab 1' },
      { title: 'Air Conditioner Check', date: new Date('2026-12-15'), time: '10:00 AM', location: 'Room 204' },
      { title: 'Projector Maintenance', date: new Date('2027-01-10'), time: '1:00 PM', location: 'AVR' },
    ]
  });

  res.json({ message: 'Database seeded successfully!' });
});

const PORT = process.env.PORT || 3000;
app.listen(8080, '0.0.0.0', () => {
  console.log('Server running on port 8080');
});