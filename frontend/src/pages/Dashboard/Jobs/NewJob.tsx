import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as z from "zod";
import { Save, ArrowLeft, Trash2, Plus } from "lucide-react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { jobAPI } from "@/lib/api";
import { api } from "@/lib/api";
import { JobData } from "@/types/job";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import AIGeneratePopup from "@/components/jobs/AIGeneratePopup";
import { useNotifications } from "@/context/NotificationContext";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import axios from "axios";
import QuestionEditor from "@/pages/DsaLab/QuestionEditor";
import ExcelImport from '@/components/jobs/ExcelImport';
import { useUser } from "@/context/UserContext";
import { RecruiterData } from "@/types/recruiter";
import { recruiterAPI } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const jobFormSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Job title must be at least 3 characters" })
    .nonempty({ message: "Job title is required" }),
  department: z.string().nonempty({ message: "Please select a department" }),
  city: z.string().nonempty({ message: "Please select a city" }),
  location: z.string().nonempty({ message: "Please select a location type" }),
  type: z.string().nonempty({ message: "Please select a job type" }),
  min_experience: z.number().min(0, { message: "Minimum experience must be 0 or greater" }).int({ message: "Experience must be a whole number" }),
  max_experience: z.number().min(0, { message: "Maximum experience must be 0 or greater" }).int({ message: "Experience must be a whole number" }),
  duration_months: z.number().min(1, { message: "Duration must be at least 1 month" }).int({ message: "Duration must be a whole number" }),
  key_qualification: z.string().nonempty({ message: "Please select a key qualification" }),
  salary_min: z.number().min(0, { message: "Minimum salary must be 0 or greater" }).int({ message: "Salary must be a whole number" }).nullable().optional(),
  salary_max: z.number().min(0, { message: "Maximum salary must be 0 or greater" }).int({ message: "Salary must be a whole number" }).nullable().optional(),
  show_salary: z.boolean().default(false),
  currency: z.string().nullable().optional(),
  description: z
    .string()
    .min(10, { message: "Description must be at least 10 characters" })
    .nonempty({ message: "Job description is required" }),
  requirements: z
    .string()
    .min(10, { message: "Requirements must be at least 10 characters" })
    .nonempty({ message: "Job requirements are required" }),
  benefits: z.string().optional(),
  status: z.string().default("active"),
  requires_dsa: z.boolean().default(false),
  requires_mcq: z.boolean().default(false),
  custom_interview_questions: z.array(z.object({
    question: z.string().nonempty({ message: "Question is required" }),
    question_type: z.enum(["technical", "behavioral", "problem_solving", "custom"]),
    order_number: z.number()
  })).optional(),
  dsa_questions: z.array(z.object({
    title: z.string().nonempty({ message: "DSA question title is required" }),
    description: z.string().nonempty({ message: "DSA question description is required" }),
    difficulty: z.string().nonempty({ message: "Please select difficulty level" }),
    time_minutes: z.number().min(1, { message: "Time limit must be at least 1 minute" }).max(180, { message: "Time limit cannot exceed 3 hours" }),
    test_cases: z.array(z.object({
      input: z.string().nonempty({ message: "Test case input is required" }),
      expected_output: z.string().nonempty({ message: "Test case expected output is required" })
    })).min(1, { message: "At least one test case is required" })
  })).optional(),
  mcq_questions: z.array(z.object({
    title: z.string().optional(),
    type: z.enum(["single", "multiple", "true_false"]).optional(),
    category: z.enum(["technical", "aptitude"]).optional(),
    time_seconds: z.number().min(30).max(180).optional(),
    options: z.array(z.string()).optional(),
    correct_options: z.array(z.number()).optional()
  })).optional(),
  mcq_timing_mode: z.enum(['per_question', 'whole_test']).default('per_question'),
  quiz_time_minutes: z.number().min(15, { message: "Quiz time must be at least 15 minutes" }).max(120, { message: "Quiz time cannot exceed 2 hours" }).nullable()
}).refine((data) => {
  // Only validate salary fields if show_salary is true
  if (data.show_salary) {
    if (!data.currency) return false;
    if (data.salary_min === null || data.salary_min === undefined) return false;
    if (data.salary_max === null || data.salary_max === undefined) return false;
    if (data.salary_min > data.salary_max) return false;
  }
  return true;
}, {
  message: "When showing salary, please provide valid currency, minimum and maximum salary values",
  path: ["show_salary"]
}).refine((data) => {
  // If MCQ is required and timing mode is whole_test, quiz_time_minutes is required
  if (data.requires_mcq && data.mcq_timing_mode === 'whole_test') {
    return data.quiz_time_minutes !== null;
  }
  return true;
}, {
  message: "Please set the total quiz time when using whole test timing mode",
  path: ["quiz_time_minutes"]
}).refine((data) => {
  // If MCQ is required and timing mode is per_question, each question must have time_seconds
  if (data.requires_mcq && data.mcq_timing_mode === 'per_question' && data.mcq_questions) {
    return data.mcq_questions.every(q => q.time_seconds !== undefined && q.time_seconds !== null);
  }
  return true;
}, {
  message: "Each question must have a time limit when using per question timing mode",
  path: ["mcq_questions"]
});

type JobFormValues = z.infer<typeof jobFormSchema>;

const saveMcqQuestions = async (jobId: number, questions: any[], jobData: JobData) => {
  try {
    // First update the job with timing information
    const jobUpdateData: Partial<JobData> = {
      ...jobData,
      mcq_timing_mode: jobData.mcq_timing_mode || 'per_question',
      // Only include quiz_time_minutes if in whole_test mode
      quiz_time_minutes: jobData.mcq_timing_mode === 'whole_test' ? jobData.quiz_time_minutes : null
    };

    // Remove fields that should not be sent in the update
    const { status, mcq_timing_mode, quiz_time_minutes, ...updateData } = jobUpdateData;

    await jobAPI.updateJob(jobId.toString(), updateData);

    for (const question of questions) {
      // Create form data for the request
      const formData = new FormData();
      formData.append('description', question.title);
      formData.append('job_id', jobId.toString());
      formData.append('type', question.type);
      formData.append('category', question.category);
      
      // Handle time_seconds based on timing mode
      if (jobData.mcq_timing_mode === 'whole_test') {
        // For whole test mode, don't send time_seconds as it's not used
        formData.append('time_seconds', '0');
      } else {
        // For per_question mode, use the question's time_seconds or default to 60
        formData.append('time_seconds', (question.time_seconds || 60).toString());
      }

      // Only append image if the question has an image
      if (question.hasImage && question.image) {
        formData.append('image', question.image);
      }

      // Create the quiz question
      const questionResponse = await api.post('/quiz-question', formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const questionId = questionResponse.data.id;

      // Handle options based on question type
      if (question.type === 'true_false') {
        // For true/false questions, create only two options
        await api.post('/quiz-option', {
          label: 'True',
          correct: question.correct_options[0] === 0,
          question_id: questionId
        }, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        await api.post('/quiz-option', {
          label: 'False',
          correct: question.correct_options[0] === 1,
          question_id: questionId
        }, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      } else {
        // For single and multiple choice questions, create all options
        for (let i = 0; i < question.options.length; i++) {
          const option = question.options[i];
          let isCorrect = false;

          if (question.type === 'single') {
            isCorrect = question.correct_options[0] === i;
          } else if (question.type === 'multiple') {
            isCorrect = question.correct_options.includes(i);
          }

          await api.post('/quiz-option', {
            label: option,
            correct: isCorrect,
            question_id: questionId
          }, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error saving MCQ questions:', error);
    if (error.response?.data?.detail) {
      throw new Error(Array.isArray(error.response.data.detail) 
        ? error.response.data.detail.map((err: any) => err.msg).join(', ')
        : error.response.data.detail);
    }
    throw error;
  }
};

const NewJob = () => {
  const navigate = useNavigate();
  const { recruiter, setRecruiter } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDsa, setIsSavingDsa] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobData, setJobData] = useState<JobData>(() => {
    // Try to load saved job data from localStorage
    const savedJobData = localStorage.getItem('draftJobData');
    if (savedJobData) {
      try {
        const parsed = JSON.parse(savedJobData);
        return {
          ...parsed,
          createdAt: parsed.createdAt || new Date().toISOString(),
          mcq_timing_mode: parsed.mcq_timing_mode || 'per_question',
          quiz_time_minutes: parsed.mcq_timing_mode === 'whole_test' ? (parsed.quiz_time_minutes || 30) : null,
          company_id: parsed.company_id || 0,
          updated_at: parsed.updated_at || new Date().toISOString()
        };
      } catch (e) {
        console.error('Error parsing saved job data:', e);
      }
    }
    // Return default state if no saved data
    return {
      id: 0,
      title: "",
      description: "",
      department: "",
      city: "",
      location: "",
      type: "full-time",
      min_experience: 0,
      max_experience: 0,
      duration_months: 12,
      key_qualification: "bachelors",
      salary_min: null,
      salary_max: null,
      currency: "INR",
      show_salary: true,
      requirements: "",
      benefits: "",
      status: "active",
      createdAt: new Date().toISOString(),
      requires_dsa: false,
      requires_mcq: false,
      custom_interview_questions: [],
      dsa_questions: [],
      mcq_questions: [],
      mcq_timing_mode: 'per_question',
      quiz_time_minutes: null,
      company_id: 0,
      updated_at: new Date().toISOString()
    };
  });
  const { addNotification } = useNotifications();
  const [cities, setCities] = useState<Array<{ id: number; name: string }>>([]);
  const [citySearchTerm, setCitySearchTerm] = useState("");
  const [cityPopupOpen, setCityPopupOpen] = useState(false);
  // Add state for currency search
  const [currencySearchTerm, setCurrencySearchTerm] = useState("");
  const [currencyPopupOpen, setCurrencyPopupOpen] = useState(false);

  // Fetch recruiter data when component mounts
  useEffect(() => {
    const fetchRecruiterData = async () => {
      try {
        const recruiterData = await recruiterAPI.verifyLogin();
        if (setRecruiter && recruiter) {
          setRecruiter({
            ...recruiter,
            ...recruiterData.data
          });
        }
      } catch (error) {
        console.error("Failed to fetch recruiter details:", error);
      }
    };

    fetchRecruiterData();
  }, []);

  // Save job data to localStorage whenever it changes
  useEffect(() => {
    if (jobData.id) { // Only save if we have a job ID (after initial save)
      localStorage.setItem('draftJobData', JSON.stringify(jobData));
    }
  }, [jobData]);

  // Clear saved job data when component unmounts or job is created
  useEffect(() => {
    return () => {
      localStorage.removeItem('draftJobData');
    };
  }, []);

  // Fetch cities when search term changes
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await api.get(`/city?keyword=${encodeURIComponent(citySearchTerm)}`);
        setCities(response.data || []);
      } catch (error) {
        console.error('Error fetching cities:', error);
        toast.error('Failed to fetch cities');
        setCities([]);
      }
    };

    if (citySearchTerm) {
      fetchCities();
    }
  }, [citySearchTerm]);

  // Add effect to handle timing mode changes
  useEffect(() => {
    if (jobData.mcq_timing_mode === 'whole_test' && !jobData.quiz_time_minutes) {
      setJobData(prev => ({
        ...prev,
        quiz_time_minutes: 30 // Default to 30 minutes when switching to whole_test mode
      }));
    } else if (jobData.mcq_timing_mode === 'per_question') {
      setJobData(prev => ({
        ...prev,
        quiz_time_minutes: null // Clear quiz_time_minutes when switching to per_question mode
      }));
    }
  }, [jobData.mcq_timing_mode]);

  interface MCQQuestion {
    title: string;
    type: "single" | "multiple" | "true_false";
    category: "technical" | "aptitude";
    time_seconds?: number;
    options: string[];
    correct_options: number[];
    hasImage?: boolean;
    image?: File | null;
    imageUrl?: string;
  }

  interface CustomInterviewQuestion {
    question: string;
    question_type: "technical" | "behavioral" | "problem_solving" | "custom";
    order_number: number;
  }

  interface TestCase {
    input: string;
    expected_output: string;
  }

  interface DSAQuestion {
    title: string;
    description: string;
    difficulty: string;
    time_minutes: number;
    test_cases: TestCase[];
  }

  interface JobData {
    id: number;
    title: string;
    description: string;
    department: string;
    city: string;
    location: string;
    type: string;
    min_experience: number;
    max_experience: number;
    duration_months: number;
    key_qualification: string;
    salary_min: number | null;
    salary_max: number | null;
    currency: string;
    show_salary: boolean;
    requirements: string;
    benefits: string;
    status: string;
    createdAt: string;
    requires_dsa: boolean;
    requires_mcq: boolean;
    custom_interview_questions: CustomInterviewQuestion[];
    dsa_questions: DSAQuestion[];
    mcq_questions: MCQQuestion[];
    mcq_timing_mode: 'per_question' | 'whole_test';
    quiz_time_minutes: number | null;
    company_id: number;
    updated_at: string;
  }

  const validateField = (field: keyof JobFormValues, value: any) => {
    try {
      const validationSchema = z.object({
        [field]: z.any()
      });
      validationSchema.parse({ [field]: value });
      setErrors(prev => ({ ...prev, [field]: '' }));
    } catch (error: any) {
      setErrors(prev => ({ ...prev, [field]: error.errors[0].message }));
    }
  };

  const handleChange = (field: keyof JobFormValues, value: any) => {
    setJobData(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      // Validate form data
      const validationResult = jobFormSchema.safeParse(jobData);
      if (!validationResult.success) {
        const newErrors: Record<string, string> = {};
        validationResult.error.errors.forEach((error) => {
          const path = error.path[0];
          if (typeof path === 'string') {
            newErrors[path] = error.message;
          }
        });
        setErrors(newErrors);
        setIsSubmitting(false);
        return;
      }

      // Prepare job data without MCQ questions
      const { mcq_questions, ...jobDataWithoutMcq } = jobData;
      const jobDataToSubmit = {
        ...jobDataWithoutMcq,
        status: "active",
        mcq_timing_mode: jobData.mcq_timing_mode || 'per_question',
        // Only include quiz_time_minutes if in whole_test mode
        quiz_time_minutes: jobData.mcq_timing_mode === 'whole_test' ? jobData.quiz_time_minutes : null
      };

      // Always update the existing draft job
      if (!jobData.id) {
        throw new Error("Please save job details first");
      }
      const response = await jobAPI.updateJob(jobData.id.toString(), jobDataToSubmit);

      // If there are MCQ questions, save them separately
      if (jobData.mcq_questions && jobData.mcq_questions.length > 0) {
        await saveMcqQuestions(jobData.id, jobData.mcq_questions, jobData);
      }

      toast.success("Job saved successfully!");
      navigate("/dashboard/jobs");
    } catch (error: any) {
      console.error("Error saving job:", error);
      if (error.response?.data?.detail) {
        toast.error(Array.isArray(error.response.data.detail) 
          ? error.response.data.detail.map((err: any) => err.msg).join(', ')
          : error.response.data.detail);
      } else {
        toast.error(error.message || "Failed to save job");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGeneratedContent = (
    field: keyof JobFormValues,
    content: string
  ) => {
    setJobData({ ...jobData, [field]: content });
  };

  const handleDsaQuestionAdd = () => {
    setJobData({
      ...jobData,
      dsa_questions: [
        ...(jobData.dsa_questions || []),
        {
          title: "",
          description: "",
          difficulty: "Easy",
          time_minutes: 30, // Default to 30 minutes
          test_cases: [
            { input: "", expected_output: "" }
          ]
        }
      ]
    });
  };

  const handleDsaQuestionUpdate = (index: number, field: string, value: any) => {
    const updatedQuestions = [...(jobData.dsa_questions || [])];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: value
    };
    setJobData({
      ...jobData,
      dsa_questions: updatedQuestions
    });
  };

  const handleTestCaseUpdate = (questionIndex: number, testCaseIndex: number, field: keyof TestCase, value: string) => {
    const updatedQuestions = [...(jobData.dsa_questions || [])];
    updatedQuestions[questionIndex].test_cases[testCaseIndex] = {
      ...updatedQuestions[questionIndex].test_cases[testCaseIndex],
      [field]: value
    };
    setJobData({
      ...jobData,
      dsa_questions: updatedQuestions
    });
  };

  const handleTestCaseAdd = (questionIndex: number) => {
    const updatedQuestions = [...(jobData.dsa_questions || [])];
    updatedQuestions[questionIndex].test_cases.push({
      input: "",
      expected_output: ""
    });
    setJobData({
      ...jobData,
      dsa_questions: updatedQuestions
    });
  };

  const handleTestCaseDelete = (questionIndex: number, testCaseIndex: number) => {
    const updatedQuestions = [...(jobData.dsa_questions || [])];
    updatedQuestions[questionIndex].test_cases = updatedQuestions[questionIndex].test_cases.filter((_, index) => index !== testCaseIndex);
    setJobData({
      ...jobData,
      dsa_questions: updatedQuestions
    });
  };

  const handleMcqQuestionAdd = () => {
    const newQuestion: MCQQuestion = {
      title: "",
      type: "single",
      category: "technical",
      time_seconds: jobData.mcq_timing_mode === 'per_question' ? 60 : undefined,
      options: ["", "", "", ""],
      correct_options: [0],
      hasImage: false,
      image: null,
      imageUrl: undefined
    };

    setJobData(prev => ({
      ...prev,
      mcq_questions: prev.mcq_questions ? [...prev.mcq_questions, newQuestion] : [newQuestion]
    }));
  };

  const handleMcqQuestionUpdate = (index: number, field: string, value: any) => {
    setJobData(prev => {
      const updatedQuestions = [...(prev.mcq_questions || [])];
      if (field === "options") {
        const optionIndex = parseInt(value.optionIndex);
        const optionValue = value.value;
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          options: updatedQuestions[index].options.map((opt, idx) =>
            idx === optionIndex ? optionValue : opt
          )
        };
      } else if (field === "type") {
        // When changing question type, reset correct options based on type
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          type: value,
          // For single choice and true/false, only one correct option
          correct_options: [0],
          options: value === "true_false" ? ["True", "False"] : ["", "", "", ""]
        };
      } else if (field === "correct_options") {
        // Handle correct options based on question type
        if (updatedQuestions[index].type === "single" || updatedQuestions[index].type === "true_false") {
          // For single choice and true/false, only allow one correct option
          updatedQuestions[index] = {
            ...updatedQuestions[index],
            correct_options: [value[0]] // Take only the first selected option
          };
        } else {
          // For multiple choice, allow multiple correct options
          updatedQuestions[index] = {
            ...updatedQuestions[index],
            correct_options: value
          };
        }
      } else if (field === "category") {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          category: value
        };
      } else if (field === "time_seconds" && prev.mcq_timing_mode === 'per_question') {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          time_seconds: value
        };
      } else if (field === "hasImage") {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          hasImage: value,
          image: value ? updatedQuestions[index].image : null,
          imageUrl: value ? updatedQuestions[index].imageUrl : undefined
        };
      } else if (field === "image") {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          image: value,
          imageUrl: value ? URL.createObjectURL(value) : undefined
        };
      } else {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          [field]: value
        };
      }
      return {
        ...prev,
        mcq_questions: updatedQuestions
      };
    });
  };

  const handleMcqQuestionDelete = (index: number) => {
    const updatedQuestions = [...jobData.mcq_questions];
    updatedQuestions.splice(index, 1);
    handleChange("mcq_questions", updatedQuestions);
  };

  const handleCustomQuestionAdd = () => {
    const newQuestion: CustomInterviewQuestion = {
      question: "",
      question_type: "technical",
      order_number: jobData.custom_interview_questions?.length || 0
    };
    handleChange("custom_interview_questions", [...(jobData.custom_interview_questions || []), newQuestion]);
  };

  const handleCustomQuestionUpdate = (index: number, field: keyof CustomInterviewQuestion, value: any) => {
    const updatedQuestions = [...(jobData.custom_interview_questions || [])];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: value
    };
    handleChange("custom_interview_questions", updatedQuestions);
  };

  const handleCustomQuestionDelete = (index: number) => {
    const updatedQuestions = [...(jobData.custom_interview_questions || [])];
    updatedQuestions.splice(index, 1);
    // Update order numbers
    updatedQuestions.forEach((q, i) => {
      q.order_number = i;
    });
    handleChange("custom_interview_questions", updatedQuestions);
  };

  const renderCustomQuestion = (question: CustomInterviewQuestion, index: number) => {
    return (
      <Card key={index} className="mb-4">
        <CardContent className="pt-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`question-${index}`}>Question</Label>
            <Textarea
                id={`question-${index}`}
                value={question.question}
                onChange={(e) => handleCustomQuestionUpdate(index, "question", e.target.value)}
                placeholder="Enter your interview question"
            />
            </div>
            <div className="grid gap-2">
                <Label>Question Type</Label>
                <Select
                value={question.question_type}
                onValueChange={(value) => handleCustomQuestionUpdate(index, "question_type", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select question type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="problem_solving">Problem Solving</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            <div className="flex justify-end">
          <Button
                variant="destructive"
            size="sm"
                onClick={() => handleCustomQuestionDelete(index)}
          >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Question
          </Button>
        </div>
                  </div>
        </CardContent>
      </Card>
    );
  };

  const handleSaveJobDetails = async () => {
    setIsSaving(true);
    try {
      // Define base required fields
      const jobDetailsFields = [
        'title', 'department', 'city', 'location', 'type',
        'min_experience', 'max_experience', 'duration_months',
        'key_qualification', 'description', 'requirements',
        'mcq_timing_mode'
      ];

      // Only add salary fields to required fields if show_salary is true
      if (jobData.show_salary) {
        jobDetailsFields.push('salary_min', 'salary_max', 'currency');
      }

      // Only add quiz_time_minutes to required fields if MCQ is enabled and timing mode is whole_test
      if (jobData.requires_mcq && jobData.mcq_timing_mode === 'whole_test') {
        jobDetailsFields.push('quiz_time_minutes');
      }

      // Debug log to see current job data
      console.log('Current job data:', jobData);

      // First check if any required fields are empty
      const emptyFields = jobDetailsFields.filter(field => {
        const value = jobData[field as keyof typeof jobData];
        // For salary fields, only check if show_salary is true
        if (field === 'salary_min' || field === 'salary_max' || field === 'currency') {
          if (!jobData.show_salary) return false;
        }
        const isEmpty = value === undefined || value === null || value === '';
        if (isEmpty) {
          console.log(`Field ${field} is empty:`, value);
        }
        return isEmpty;
      });

      if (emptyFields.length > 0) {
        console.log('Empty fields found:', emptyFields);
        // Set errors for empty fields
        const newErrors: Record<string, string> = {};
        emptyFields.forEach(field => {
          newErrors[field] = "This field is required";
        });
        setErrors(newErrors);

        // Show simple error message and scroll to first empty field
        toast.error("Please fill in all required fields");
        const firstEmptyField = emptyFields[0];
        const element = document.getElementById(firstEmptyField);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        setIsSaving(false);
        return;
      }

      // Debug log for validation
      console.log('Validating job data with schema...');
      const validationSchema = z.object(
        Object.fromEntries(
          jobDetailsFields.map(field => [field, z.any()])
        )
      );

      const validationResult = validationSchema.safeParse(jobData);
      if (!validationResult.success) {
        console.log('Validation errors:', validationResult.error.errors);
        const newErrors: Record<string, string> = {};
        validationResult.error.errors.forEach((error) => {
          const path = error.path[0];
          if (typeof path === 'string') {
            newErrors[path] = error.message;
          }
        });
        setErrors(newErrors);
        
        toast.error("Please fix the validation errors");
        const firstErrorField = Object.keys(newErrors)[0];
        const element = document.getElementById(firstErrorField);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        setIsSaving(false);
        return;
      }

      console.log('Preparing to save job data...');
      let response;
      if (jobData.id) {
        // Update existing job
        console.log('Updating existing job...');
        response = await jobAPI.updateJob(jobData.id.toString(), {
          ...jobData,
          status: 'draft',
          mcq_timing_mode: jobData.mcq_timing_mode || 'per_question',
          quiz_time_minutes: jobData.mcq_timing_mode === 'whole_test' ? jobData.quiz_time_minutes : null
        });
      } else {
        // Create new job
        console.log('Creating new job...');
        response = await jobAPI.createJob({
          ...jobData,
          status: 'draft',
          mcq_timing_mode: jobData.mcq_timing_mode || 'per_question',
          quiz_time_minutes: jobData.mcq_timing_mode === 'whole_test' ? jobData.quiz_time_minutes : null
        });
      }

      console.log('Save response:', response);

      if (response.status >= 200 && response.status < 300) {
        toast.success(jobData.id ? "Job details updated successfully" : "Job details saved successfully");
        // Update the job ID in the state if it's a new job
        if (!jobData.id) {
        setJobData(prev => ({ 
          ...prev, 
          id: response.data.id,
          mcq_timing_mode: prev.mcq_timing_mode || 'per_question',
          quiz_time_minutes: prev.mcq_timing_mode === 'whole_test' ? prev.quiz_time_minutes : null
        }));
        }
      } else {
        throw new Error(jobData.id ? "Failed to update job details" : "Failed to save job details");
      }
    } catch (error: any) {
      console.error("Error saving job details:", error);
      let errorMessage = jobData.id ? "Failed to update job details" : "Failed to save job details";

      if (error.response?.data?.detail) {
        // Handle array of validation errors
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map((err: any) => err.msg).join(', ');
        } else {
          // Handle single error message
        errorMessage = error.response.data.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDsaQuestions = async () => {
    if (!jobData.id) {
      toast.error("Please save job details first");
      return;
    }

    setIsSavingDsa(true);
    try {
      if (!jobData.dsa_questions || jobData.dsa_questions.length === 0) {
        toast.error("Please add at least one DSA question");
        setIsSavingDsa(false);
        return;
      }

      const dsaQuestionSchema = z.object({
        title: z.string().nonempty(),
        description: z.string().nonempty(),
        difficulty: z.string().nonempty(),
        time_minutes: z.number().min(1).max(180),
        test_cases: z.array(z.object({
          input: z.string().nonempty(),
          expected_output: z.string().nonempty()
        })).min(1)
      });

      const validationSchema = z.object({
        dsa_questions: z.array(dsaQuestionSchema)
      });

      const validationResult = validationSchema.safeParse({ dsa_questions: jobData.dsa_questions });
      if (!validationResult.success) {
        const newErrors: Record<string, string> = {};
        validationResult.error.errors.forEach((error) => {
          const path = error.path[0];
          if (typeof path === 'string') {
            newErrors[path] = error.message;
          }
        });
        setErrors(newErrors);
        toast.error("Please fill in all required fields for DSA questions");
        setIsSavingDsa(false);
        return;
      }

      // Update job with DSA questions
      const response = await jobAPI.updateJob(jobData.id.toString(), {
        ...jobData,
        dsa_questions: jobData.dsa_questions
      });

      if (response.status >= 200 && response.status < 300) {
        toast.success("DSA questions saved successfully");
      } else {
        throw new Error("Failed to save DSA questions");
      }
    } catch (error: any) {
      console.error("Error saving DSA questions:", error);
      let errorMessage = "Failed to save DSA questions";

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsSavingDsa(false);
    }
  };

  const handleExcelImport = (importedQuestions: any[]) => {
    // Prevent form submission
    event?.preventDefault();
    event?.stopPropagation();
    
    setJobData(prev => ({
      ...prev,
      mcq_questions: [
        ...(prev.mcq_questions || []),
        ...importedQuestions.map(q => ({
          title: q.title,
          type: q.type,
          category: q.category,
          time_seconds: q.time_seconds,
          options: q.options,
          correct_options: q.correct_options
        }))
      ]
    }));
  };

  // Add these interfaces at the top with other interfaces
  interface Currency {
    value: string;
    label: string;
    symbol: string;
    name: string;
  }

  interface LocationCurrency {
    currency: string;
    symbol: string;
    name: string;
  }

  // Update the currency symbols mapping to be more comprehensive
  const CURRENCY_SYMBOLS: Record<string, string> = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
    'CNY': '¥',
    'JPY': '¥',
    'AUD': 'A$',
    'CAD': 'C$',
    'SGD': 'S$',
    'CHF': 'Fr',
    'AED': 'د.إ',
    'SAR': '﷼',
    'BRL': 'R$',
    'RUB': '₽',
    'ZAR': 'R',
    'MXN': '$',
    'KRW': '₩',
    'TRY': '₺',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr',
    'PLN': 'zł',
    'ILS': '₪',
    'HKD': 'HK$',
    'TWD': 'NT$',
    'THB': '฿',
    'MYR': 'RM',
    'PHP': '₱',
    'IDR': 'Rp',
    'VND': '₫'
  };

  // Add state for available currencies
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>([
    { value: 'USD', label: '$ USD', symbol: '$', name: 'US Dollar' },
    { value: 'INR', label: '₹ INR', symbol: '₹', name: 'Indian Rupee' }
  ]);

  // Add this function to get currency info for a location
  const getLocationCurrency = async (city: string, country: string): Promise<LocationCurrency | null> => {
    try {
      // First try to get currency from city
      const cityResponse = await api.get(`/city?keyword=${encodeURIComponent(city)}`);
      const cityData = cityResponse.data;
      const cityMatch = cityData.find((c: any) => c.name.toLowerCase() === city.toLowerCase());
      
      if (cityMatch?.currency) {
        return {
          currency: cityMatch.currency,
          symbol: CURRENCY_SYMBOLS[cityMatch.currency] || cityMatch.currency,
          name: cityMatch.currency_name || cityMatch.currency
        };
      }

      // If no city currency, try country
      const countryResponse = await api.get(`/country?keyword=${encodeURIComponent(country)}`);
      const countryData = countryResponse.data;
      const countryMatch = countryData.find((c: any) => c.name.toLowerCase() === country.toLowerCase());
      
      if (countryMatch?.currency) {
        return {
          currency: countryMatch.currency,
          symbol: CURRENCY_SYMBOLS[countryMatch.currency] || countryMatch.currency,
          name: countryMatch.currency_name || countryMatch.currency
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching location currency:', error);
      return null;
    }
  };

  // Update the getAvailableCurrencies function
  const getAvailableCurrencies = async (): Promise<Currency[]> => {
    const currencies: Currency[] = [
      { value: 'USD', label: '$ USD', symbol: '$', name: 'US Dollar' },
      { value: 'INR', label: '₹ INR', symbol: '₹', name: 'Indian Rupee' }
    ];

    try {
      // Fetch all countries to get their currencies
      const response = await api.get('/country');
      const countries = response.data || [];

      // Create a Set to track unique currencies
      const uniqueCurrencies = new Set<string>();
      
      // Add location-based currency first if available
      if (jobData.city && recruiter?.country) {
        const locationCurrency = await getLocationCurrency(jobData.city, recruiter.country);
        if (locationCurrency) {
          uniqueCurrencies.add(locationCurrency.currency);
          currencies.push({
            value: locationCurrency.currency,
            label: `${locationCurrency.symbol} ${locationCurrency.currency}`,
            symbol: locationCurrency.symbol,
            name: locationCurrency.name
          });
        }
      }

      // Add currencies from all countries
      for (const country of countries) {
        if (country.currency && !uniqueCurrencies.has(country.currency)) {
          uniqueCurrencies.add(country.currency);
          const symbol = CURRENCY_SYMBOLS[country.currency] || country.currency;
          currencies.push({
            value: country.currency,
            label: `${symbol} ${country.currency}`,
            symbol: symbol,
            name: country.currency_name || country.currency
          });
        }
      }

      // Sort currencies alphabetically by code
      currencies.sort((a, b) => a.value.localeCompare(b.value));

    } catch (error) {
      console.error('Error fetching available currencies:', error);
    }

    return currencies;
  };

  // Add effect to fetch currencies when component mounts
  useEffect(() => {
    const fetchCurrencies = async () => {
      const currencies = await getAvailableCurrencies();
      setAvailableCurrencies(currencies);
    };
    fetchCurrencies();
  }, []); // Only run once when component mounts

  // Add effect to update currency when city changes
  useEffect(() => {
    const updateCurrencyForLocation = async () => {
      if (jobData.city && recruiter?.country) {
        const locationCurrency = await getLocationCurrency(jobData.city, recruiter.country);
        if (locationCurrency) {
          // Update available currencies
          const currencies = await getAvailableCurrencies();
          setAvailableCurrencies(currencies);
          
          // Set the currency if it's not already set
          if (!jobData.currency) {
            handleChange("currency", locationCurrency.currency);
          }
        }
      }
    };

    updateCurrencyForLocation();
  }, [jobData.city, recruiter?.country]);

  // Add logger for currency selection
  const handleCurrencyChange = (value: string) => {
    handleChange("currency", value);
  };

  // Update the timing mode change handler
  const handleTimingModeChange = (value: 'per_question' | 'whole_test') => {
    setJobData(prev => ({
      ...prev,
      mcq_timing_mode: value,
      // When switching to whole_test, set default time to 60 minutes (1 hour)
      quiz_time_minutes: value === 'whole_test' ? 60 : null,
      // Clear individual question times when switching to whole_test
      mcq_questions: prev.mcq_questions?.map(q => ({
        ...q,
        time_seconds: value === 'per_question' ? (q.time_seconds || 60) : undefined
      }))
    }));
  };

  // Update the quiz time change handler
  const handleQuizTimeChange = (value: string) => {
    const minutes = parseInt(value);
    setJobData(prev => ({
      ...prev,
      quiz_time_minutes: minutes
    }));
  };

  const handleSaveMcqQuestions = async () => {
    if (!jobData.id) {
      toast.error("Please save job details first");
      return;
    }

    setIsSavingMcq(true);
    try {
      if (!jobData.mcq_questions || jobData.mcq_questions.length === 0) {
        toast.error("Please add at least one MCQ question");
        setIsSavingMcq(false);
        return;
      }

      // Validate MCQ questions
      const mcqQuestionSchema = z.object({
        title: z.string().nonempty({ message: "Question title is required" }),
        type: z.enum(["single", "multiple", "true_false"]),
        category: z.enum(["technical", "aptitude"]),
        time_seconds: z.number().min(30).max(180).optional(),
        options: z.array(z.string().nonempty({ message: "Option text is required" })),
        correct_options: z.array(z.number())
      });

      const validationSchema = z.object({
        mcq_questions: z.array(mcqQuestionSchema)
      });

      const validationResult = validationSchema.safeParse({ mcq_questions: jobData.mcq_questions });
      if (!validationResult.success) {
        const newErrors: Record<string, string> = {};
        validationResult.error.errors.forEach((error) => {
          const path = error.path[0];
          if (typeof path === 'string') {
            newErrors[path] = error.message;
          }
        });
        setErrors(newErrors);
        toast.error("Please fill in all required fields for MCQ questions");
        setIsSavingMcq(false);
        return;
      }

      // Update job with MCQ questions
      const response = await jobAPI.updateJob(jobData.id.toString(), {
        ...jobData,
        mcq_questions: jobData.mcq_questions,
        mcq_timing_mode: jobData.mcq_timing_mode,
        quiz_time_minutes: jobData.mcq_timing_mode === 'whole_test' ? jobData.quiz_time_minutes : null
      });

      if (response.status >= 200 && response.status < 300) {
        toast.success("MCQ questions saved successfully");
      } else {
        throw new Error("Failed to save MCQ questions");
      }
    } catch (error: any) {
      console.error("Error saving MCQ questions:", error);
      let errorMessage = "Failed to save MCQ questions";

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsSavingMcq(false);
    }
  };

  const handleSaveCustomQuestions = async () => {
    if (!jobData.id) {
      toast.error("Please save job details first");
      return;
    }

    setIsSavingCustom(true);
    try {
      if (!jobData.custom_interview_questions || jobData.custom_interview_questions.length === 0) {
        toast.error("Please add at least one custom question");
        setIsSavingCustom(false);
        return;
      }

      // Validate custom questions
      const customQuestionSchema = z.object({
        question: z.string().nonempty({ message: "Question is required" }),
        question_type: z.enum(["technical", "behavioral", "problem_solving", "custom"]),
        order_number: z.number()
      });

      const validationSchema = z.object({
        custom_interview_questions: z.array(customQuestionSchema)
      });

      const validationResult = validationSchema.safeParse({ custom_interview_questions: jobData.custom_interview_questions });
      if (!validationResult.success) {
        const newErrors: Record<string, string> = {};
        validationResult.error.errors.forEach((error) => {
          const path = error.path[0];
          if (typeof path === 'string') {
            newErrors[path] = error.message;
          }
        });
        setErrors(newErrors);
        toast.error("Please fill in all required fields for custom questions");
        setIsSavingCustom(false);
        return;
      }

      // Save each custom question
      for (const question of jobData.custom_interview_questions) {
        await api.post('/recruiter/interview-question', {
          question: question.question,
          question_type: question.question_type,
          order_number: question.order_number,
          job_id: jobData.id
        }, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      }

      toast.success("Custom questions saved successfully");
    } catch (error: any) {
      console.error("Error saving custom questions:", error);
      let errorMessage = "Failed to save custom questions";

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsSavingCustom(false);
    }
  };

  // Add state for custom questions saving
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [isSavingMcq, setIsSavingMcq] = useState(false);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Create New Job"
          description="Add a new job posting to find the perfect candidate"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dashboard/jobs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
        </PageHeader>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Tabs value={activeTab} onValueChange={(value) => {
            // Validate job details before allowing tab switch
            if (value !== "details") {
              const jobDetailsFields = [
                'title', 'department', 'city', 'location', 'type',
                'min_experience', 'max_experience', 'duration_months',
                'key_qualification', 'salary_min', 'salary_max',
                'show_salary', 'description', 'requirements', 'benefits'
              ];

              const validationSchema = z.object(
                Object.fromEntries(
                  jobDetailsFields.map(field => [field, z.any()])
                )
              );

              const validationResult = validationSchema.safeParse(jobData);
              if (!validationResult.success) {
                const newErrors: Record<string, string> = {};
                validationResult.error.errors.forEach((error) => {
                  const path = error.path[0];
                  if (typeof path === 'string') {
                    newErrors[path] = error.message;
                  }
                });
                setErrors(newErrors);
                
                // Show error message for the specific tab
                let errorMessage = "Please fill in all required fields in Job Details tab first";
                if (value === "dsa" && !jobData.requires_dsa) {
                  errorMessage = "Please enable DSA assessment in Job Details tab first";
                } else if (value === "mcq" && !jobData.requires_mcq) {
                  errorMessage = "Please enable MCQ assessment in Job Details tab first";
                }
                
                toast.error(errorMessage);
                
                // Scroll to the first error field
                const firstErrorField = Object.keys(newErrors)[0];
                const element = document.getElementById(firstErrorField);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
              }

              // Additional checks for specific tabs
              if (value === "dsa") {
                if (!jobData.requires_dsa) {
                  toast.error("Please enable DSA assessment in Job Details tab first");
                  return;
                }
                if (!jobData.id) {
                  toast.error("Please save job details first");
                  return;
                }
              }
              if (value === "mcq") {
                if (!jobData.requires_mcq) {
                  toast.error("Please enable MCQ assessment in Job Details tab first");
                  return;
                }
                if (!jobData.id) {
                  toast.error("Please save job details first");
                  return;
                }
              }
              if (value === "custom" && !jobData.id) {
                toast.error("Please save job details first");
                return;
              }
            }
            setActiveTab(value);
          }} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Job Details</TabsTrigger>
              <TabsTrigger value="dsa">DSA Questions</TabsTrigger>
              <TabsTrigger value="mcq">MCQ Questions</TabsTrigger>
              <TabsTrigger value="custom">Custom Questions</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              {/* Basic Information Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="job-title">
                      Job Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="job-title"
                      placeholder="e.g. Senior Software Engineer"
                      value={jobData.title}
                      onChange={(e) => handleChange("title", e.target.value)}
                    />
                    {errors.title && (
                      <p className="text-sm text-destructive">{errors.title}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Department <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      onValueChange={(val) => handleChange("department", val)}
                      defaultValue={jobData.department}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] overflow-y-auto">
                        <SelectItem value="engineering">Engineering</SelectItem>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="design">Design</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="customer_support">Customer Support</SelectItem>
                        <SelectItem value="hr">Human Resources</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.department && (
                      <p className="text-sm text-destructive">{errors.department}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Job Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      onValueChange={(val) => handleChange("type", val)}
                      defaultValue={jobData.type}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select job type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full Time</SelectItem>
                        <SelectItem value="part-time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                        <SelectItem value="temporary">Temporary</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.type && (
                      <p className="text-sm text-destructive">{errors.type}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Location Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      onValueChange={(val) => handleChange("location", val)}
                      defaultValue={jobData.location}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remote">Remote</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">On-site</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.location && (
                      <p className="text-sm text-destructive">{errors.location}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Popover open={cityPopupOpen} onOpenChange={setCityPopupOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !jobData.city && "text-muted-foreground"
                          )}
                        >
                          {jobData.city || "Select a city"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search city..."
                            value={citySearchTerm}
                            onValueChange={setCitySearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>No city found.</CommandEmpty>
                            <CommandGroup className="max-h-[300px] overflow-auto">
                              {cities.map((city) => (
                                <CommandItem
                                  key={city.id}
                                  value={city.name}
                                  onSelect={() => {
                                    handleChange("city", city.name);
                                    setCityPopupOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      jobData.city === city.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {city.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.city && (
                      <p className="text-sm text-destructive">{errors.city}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Experience & Salary Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Experience & Salary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>
                      Minimum Experience (Years) <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      onValueChange={(val) => handleChange("min_experience", Number(val))}
                      defaultValue={jobData.min_experience?.toString()}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select min experience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Fresher</SelectItem>
                        <SelectItem value="1">1 year</SelectItem>
                        <SelectItem value="2">2 years</SelectItem>
                        <SelectItem value="3">3 years</SelectItem>
                        <SelectItem value="4">4 years</SelectItem>
                        <SelectItem value="5">5+ years</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.min_experience && (
                      <p className="text-sm text-destructive">{errors.min_experience}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Maximum Experience (Years) <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      onValueChange={(val) => handleChange("max_experience", Number(val))}
                      defaultValue={jobData.max_experience?.toString()}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select max experience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 year</SelectItem>
                        <SelectItem value="2">2 years</SelectItem>
                        <SelectItem value="3">3 years</SelectItem>
                        <SelectItem value="4">4 years</SelectItem>
                        <SelectItem value="5">5+ years</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.max_experience && (
                      <p className="text-sm text-destructive">{errors.max_experience}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Required Qualification <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={jobData.key_qualification}
                      onValueChange={(value) => handleChange("key_qualification", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select qualification" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                        <SelectItem value="masters">Master's Degree</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.key_qualification && (
                      <p className="text-sm text-destructive">{errors.key_qualification}</p>
                    )}
                  </div>

                  {(jobData.type === "internship" || jobData.type === "contract" || jobData.type === "temporary") && (
                    <div className="space-y-2">
                      <Label>
                        Job Duration (Months) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="duration_months"
                        type="number"
                        min="1"
                        value={jobData.duration_months}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^\d+$/.test(value)) {
                            handleChange("duration_months", value === '' ? 0 : parseInt(value));
                          }
                        }}
                      />
                      {errors.duration_months && (
                        <p className="text-sm text-destructive">{errors.duration_months}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Salary Range</Label>
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm font-normal">
                          Show salary in posting
                        </Label>
                        <Switch
                          checked={jobData.show_salary}
                          onCheckedChange={(checked) => {
                            handleChange("show_salary", checked);
                            if (!checked) {
                              // Clear salary fields when show_salary is turned off
                              handleChange("salary_min", null);
                              handleChange("salary_max", null);
                              handleChange("currency", null);
                            }
                          }}
                        />
                      </div>
                    </div>

                    {jobData.show_salary && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="currency">Currency</Label>
                          <Popover open={currencyPopupOpen} onOpenChange={setCurrencyPopupOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !jobData.currency && "text-muted-foreground"
                                )}
                              >
                                {jobData.currency 
                                  ? availableCurrencies.find(c => c.value === jobData.currency)?.label 
                                  : "Select currency"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                              <Command>
                                <CommandInput
                                  placeholder="Search currency..."
                                  value={currencySearchTerm}
                                  onValueChange={setCurrencySearchTerm}
                                />
                                <CommandList>
                                  <CommandEmpty>No currency found.</CommandEmpty>
                                  <CommandGroup className="max-h-[300px] overflow-auto">
                                    {availableCurrencies
                                      .filter(currency => 
                                        currency.value.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
                                        currency.name.toLowerCase().includes(currencySearchTerm.toLowerCase())
                                      )
                                      .map((currency) => (
                                        <CommandItem
                                          key={currency.value}
                                          value={currency.value}
                                          onSelect={() => {
                                            handleChange("currency", currency.value);
                                            setCurrencyPopupOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              jobData.currency === currency.value ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          {currency.label}
                                          <span className="ml-2 text-muted-foreground">
                                            {currency.name}
                                          </span>
                                        </CommandItem>
                                      ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {jobData.currency && (
                            <p className="text-sm text-muted-foreground">
                              {availableCurrencies.find(c => c.value === jobData.currency)?.name}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="salary_min">Minimum Salary</Label>
                            <Input
                              id="salary_min"
                              type="number"
                              min="0"
                              placeholder="e.g. 60000"
                              value={jobData.salary_min || ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || /^\d+$/.test(value)) {
                                  handleChange("salary_min", value === '' ? null : Number(value));
                                }
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="salary_max">Maximum Salary</Label>
                            <Input
                              id="salary_max"
                              type="number"
                              min="0"
                              placeholder="e.g. 80000"
                              value={jobData.salary_max || ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || /^\d+$/.test(value)) {
                                  handleChange("salary_max", value === '' ? null : Number(value));
                                }
                              }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {(errors.salary_min || errors.salary_max || errors.currency || errors.show_salary) && (
                      <p className="text-sm text-destructive">
                        {errors.salary_min || errors.salary_max || errors.currency || errors.show_salary}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Job Details Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Job Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>
                        Job Description <span className="text-destructive">*</span>
                      </Label>
                      <AIGeneratePopup
                        title="Generate Description"
                        fieldLabel="Description"
                        jobTitle={jobData.title}
                        department={jobData.department}
                        location={jobData.location}
                        jobType={jobData.type}
                        keyQualification={jobData.key_qualification}
                        minExperience={jobData.min_experience.toString()}
                        maxExperience={jobData.max_experience.toString()}
                        onGenerated={(content) => handleChange("description", content)}
                      />
                    </div>
                    <Textarea
                      id="description"
                      className="min-h-[200px]"
                      placeholder="Describe the role, responsibilities, and expectations..."
                      value={jobData.description}
                      onChange={(e) => handleChange("description", e.target.value)}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>
                        Requirements <span className="text-destructive">*</span>
                      </Label>
                      <AIGeneratePopup
                        title="Generate Requirements"
                        fieldLabel="Requirements"
                        jobTitle={jobData.title}
                        department={jobData.department}
                        location={jobData.location}
                        jobType={jobData.type}
                        keyQualification={jobData.key_qualification}
                        minExperience={jobData.min_experience.toString()}
                        maxExperience={jobData.max_experience.toString()}
                        onGenerated={(content) => handleChange("requirements", content)}
                      />
                    </div>
                    <Textarea
                      id="requirements"
                      className="min-h-[200px]"
                      placeholder="List the required skills, qualifications, and experience..."
                      value={jobData.requirements}
                      onChange={(e) => handleChange("requirements", e.target.value)}
                    />
                    {errors.requirements && (
                      <p className="text-sm text-destructive">{errors.requirements}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Benefits (Optional)</Label>
                    <Textarea
                      id="benefits"
                      className="min-h-[150px]"
                      placeholder="List the benefits and perks offered (optional)..."
                      value={jobData.benefits}
                      onChange={(e) => handleChange("benefits", e.target.value)}
                    />
                    {errors.benefits && (
                      <p className="text-sm text-destructive">{errors.benefits}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={jobData.requires_dsa}
                      onCheckedChange={(checked) =>
                        handleChange("requires_dsa", checked)
                      }
                    />
                    <Label>Requires DSA Assessment</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="requires_mcq"
                      checked={jobData.requires_mcq}
                      onCheckedChange={(checked) =>
                        handleChange("requires_mcq", checked)
                      }
                    />
                    <Label>Requires MCQ Assessment</Label>
                  </div>

                  <div className="flex justify-end mt-6">
                    <Button
                      type="button"
                      onClick={handleSaveJobDetails}
                      disabled={isSaving}
                      variant="outline"
                    >
                      {isSaving ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Job Details
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dsa">
              <Card>
                <CardHeader>
                  <CardTitle>DSA Questions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!jobData.requires_dsa ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        Enable DSA assessment in the Job Details tab to add questions
                      </p>
                    </div>
                  ) : (
                    <>
                      {jobData.dsa_questions?.map((question: DSAQuestion, questionIndex: number) => (
                        <Card key={questionIndex} className="p-4">
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <Label>Question Title</Label>
                                <Input
                                  value={question.title}
                                  onChange={(e) =>
                                    handleDsaQuestionUpdate(questionIndex, "title", e.target.value)
                                  }
                                  placeholder="e.g. Two Sum"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Difficulty</Label>
                                <Select
                                  value={question.difficulty}
                                  onValueChange={(value) =>
                                    handleDsaQuestionUpdate(questionIndex, "difficulty", value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select difficulty" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Easy">Easy</SelectItem>
                                    <SelectItem value="Medium">Medium</SelectItem>
                                    <SelectItem value="Hard">Hard</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label>Time Limit (minutes)</Label>
                                <Select
                                  value={question.time_minutes.toString()}
                                  onValueChange={(value) =>
                                    handleDsaQuestionUpdate(questionIndex, "time_minutes", parseInt(value))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select time limit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="15">15 minutes</SelectItem>
                                    <SelectItem value="30">30 minutes</SelectItem>
                                    <SelectItem value="45">45 minutes</SelectItem>
                                    <SelectItem value="60">60 minutes</SelectItem>
                                    <SelectItem value="90">90 minutes</SelectItem>
                                    <SelectItem value="120">120 minutes</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Question Description</Label>
                              <QuestionEditor
                                questionDescription={question.description}
                                setQuestionDescription={(value: string) =>
                                  handleDsaQuestionUpdate(questionIndex, "description", value)
                                }
                              />
                            </div>

                            <div className="space-y-4">
                              <div className="flex justify-between items-center">
                                <Label>Test Cases</Label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleTestCaseAdd(questionIndex)}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Test Case
                                </Button>
                              </div>

                              {question.test_cases.map((testCase: TestCase, testCaseIndex: number) => (
                                <div key={testCaseIndex} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Input</Label>
                                    <Textarea
                                      value={testCase.input}
                                      onChange={(e) =>
                                        handleTestCaseUpdate(questionIndex, testCaseIndex, "input", e.target.value)
                                      }
                                      placeholder="Input"
                                      className="min-h-[100px] font-mono whitespace-pre-wrap"
                                      rows={4}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Expected Output</Label>
                                    <Textarea
                                      value={testCase.expected_output}
                                      onChange={(e) =>
                                        handleTestCaseUpdate(questionIndex, testCaseIndex, "expected_output", e.target.value)
                                      }
                                      placeholder="Expected Output"
                                      className="min-h-[100px] font-mono whitespace-pre-wrap"
                                      rows={4}
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTestCaseDelete(questionIndex, testCaseIndex)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updatedQuestions = [...(jobData.dsa_questions || [])];
                                  updatedQuestions.splice(questionIndex, 1);
                                  setJobData({ ...jobData, dsa_questions: updatedQuestions });
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Question
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                      
                      <div className="flex justify-end mt-6">
                        <Button
                          type="button"
                          onClick={handleDsaQuestionAdd}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add DSA Question
                        </Button>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          type="button"
                          onClick={handleSaveDsaQuestions}
                          disabled={isSavingDsa}
                          variant="outline"
                        >
                          {isSavingDsa ? (
                            <>
                              <LoadingSpinner size="sm" className="mr-2" />
                              Saving DSA Questions...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save DSA Questions
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mcq">
              <Card>
                <CardHeader>
                  <CardTitle>MCQ Questions</CardTitle>
                  <CardDescription>
                    Add multiple-choice questions for the assessment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!jobData.requires_mcq ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        Enable MCQ assessment in the Job Details tab to add questions
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Timing Mode</Label>
                          <Select
                            value={jobData.mcq_timing_mode || 'per_question'}
                            onValueChange={handleTimingModeChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select timing mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_question">Per Question Timing</SelectItem>
                              <SelectItem value="whole_test">Whole Test Timing</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {jobData.mcq_timing_mode === 'whole_test' && (
                          <div className="space-y-2">
                            <Label>Total Test Time (minutes)</Label>
                            <Select
                              value={jobData.quiz_time_minutes?.toString() || "60"}
                              onValueChange={handleQuizTimeChange}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select total time" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="90">1.5 hours</SelectItem>
                                <SelectItem value="120">2 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="space-y-1">
                            <h3 className="text-lg font-medium">MCQ Questions</h3>
                            <p className="text-sm text-muted-foreground">
                              Total Questions: {jobData.mcq_questions?.length || 0}
                            </p>
                          </div>
                          <div className="flex gap-4">
                            <ExcelImport onImport={handleExcelImport} />
                            <Button type="button" onClick={handleMcqQuestionAdd}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Question
                            </Button>
                          </div>
                        </div>
                        {jobData.mcq_questions?.map((question, index) => (
                          <Card key={index} className="mb-4">
                            <CardContent className="pt-6">
                              <div className="grid gap-4">
                                <div className="grid gap-2">
                                  <Label htmlFor={`question-${index}`}>Question</Label>
                                  <Textarea
                                    id={`question-${index}`}
                                    value={question.title}
                                    onChange={(e) => handleMcqQuestionUpdate(index, "title", e.target.value)}
                                    placeholder="Enter your question"
                                  />
                                </div>

                                {/* Image upload section */}
                                <div className="space-y-2">
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id={`has-image-${index}`}
                                      checked={question.hasImage || false}
                                      onCheckedChange={(checked) => handleMcqQuestionUpdate(index, "hasImage", checked)}
                                    />
                                    <Label htmlFor={`has-image-${index}`}>Include Image</Label>
                                  </div>
                                  
                                  {question.hasImage && (
                                    <div className="space-y-2">
                                      <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleMcqQuestionUpdate(index, "image", file);
                                          }
                                        }}
                                      />
                                      {question.imageUrl && (
                                        <div className="mt-2">
                                          <img 
                                            src={question.imageUrl} 
                                            alt="Question preview" 
                                            className="max-w-xs max-h-48 object-contain rounded-md border border-gray-200"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="grid gap-2">
                                  <Label>Question Type</Label>
                                  <Select
                                    value={question.type}
                                    onValueChange={(value) => handleMcqQuestionUpdate(index, "type", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select question type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="single">Single Choice</SelectItem>
                                      <SelectItem value="multiple">Multiple Choice</SelectItem>
                                      <SelectItem value="true_false">True/False</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-2">
                                  <Label>Category</Label>
                                  <Select
                                    value={question.category}
                                    onValueChange={(value) => handleMcqQuestionUpdate(index, "category", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="technical">Technical</SelectItem>
                                      <SelectItem value="aptitude">Aptitude</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {jobData.mcq_timing_mode === 'per_question' && (
                                  <div className="grid gap-2">
                                    <Label>Time Limit (seconds)</Label>
                                    <Input
                                      type="number"
                                      min="30"
                                      max="180"
                                      value={question.time_seconds?.toString() || "60"}
                                      onChange={(e) => handleMcqQuestionUpdate(index, "time_seconds", parseInt(e.target.value))}
                                    />
                                  </div>
                                )}

                                <div className="grid gap-2">
                                  <Label>Options</Label>
                                  {question.type === "true_false" ? (
                                    <div className="space-y-2">
                                      <RadioGroup
                                        value={question.correct_options[0]?.toString()}
                                        onValueChange={(value) => handleMcqQuestionUpdate(index, "correct_options", [parseInt(value)])}
                                      >
                                        <div className="flex flex-col space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="0" id={`true-${index}`} />
                                            <Label htmlFor={`true-${index}`}>True</Label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="1" id={`false-${index}`} />
                                            <Label htmlFor={`false-${index}`}>False</Label>
                                          </div>
                                        </div>
                                      </RadioGroup>
                                    </div>
                                  ) : (
                                    question.options.map((option: string, optionIndex: number) => (
                                      <div key={optionIndex} className="flex items-center space-x-2">
                                        <Input
                                          value={option}
                                          onChange={(e) => handleMcqQuestionUpdate(index, "options", {
                                            optionIndex,
                                            value: e.target.value
                                          })}
                                          placeholder={`Option ${optionIndex + 1}`}
                                        />
                                        {question.type === "single" ? (
                                          <RadioGroup
                                            value={question.correct_options[0]?.toString()}
                                            onValueChange={(value) => handleMcqQuestionUpdate(index, "correct_options", [parseInt(value)])}
                                          >
                                            <RadioGroupItem value={optionIndex.toString()} id={`option-${index}-${optionIndex}`} />
                                          </RadioGroup>
                                        ) : (
                                          <Checkbox
                                            checked={question.correct_options.includes(optionIndex)}
                                            onCheckedChange={(checked) => {
                                              const currentCorrect = [...question.correct_options];
                                              if (checked) {
                                                currentCorrect.push(optionIndex);
                                              } else {
                                                const index = currentCorrect.indexOf(optionIndex);
                                                if (index > -1) {
                                                  currentCorrect.splice(index, 1);
                                                }
                                              }
                                              handleMcqQuestionUpdate(index, "correct_options", currentCorrect);
                                            }}
                                          />
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>

                                <div className="flex justify-end">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleMcqQuestionDelete(index)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Question
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          type="button"
                          onClick={handleSaveMcqQuestions}
                          disabled={isSavingMcq}
                          variant="outline"
                        >
                          {isSavingMcq ? (
                            <>
                              <LoadingSpinner size="sm" className="mr-2" />
                              Saving MCQ Questions...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save MCQ Questions
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="custom">
              <Card>
                <CardHeader>
                  <CardTitle>Custom Interview Questions</CardTitle>
                  <CardDescription>
                    Add custom questions that will be asked during the interview process.
                    These questions will be presented to candidates in the order specified.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {jobData.custom_interview_questions?.map((question, index) => renderCustomQuestion(question, index))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCustomQuestionAdd}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Question
                    </Button>
                    <div className="flex justify-end mt-4">
                      <Button
                        type="button"
                        onClick={handleSaveCustomQuestions}
                        disabled={isSavingCustom}
                      >
                        {isSavingCustom ? (
                          <>
                            <LoadingSpinner className="mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Questions
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating Job...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Create Job
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default NewJob;

