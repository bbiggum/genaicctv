'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Card,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Image,
  NumberInput,
  NumberInputField,
  Select,
  Spacer,
  Switch,
  Tag,
  VStack,
  Button,
  Text
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useEffect, useState } from 'react';
import { getPrompts, putPrompt } from './api';
import { fetchAuth } from './auth';

const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT ?? '';
const captionApiEndpoint = `${apiEndpoint}/caption`;
const cloudfrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? '';

export default function Home() {
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [isUpdated, setIsUpdated] = useState(true);
  const [caption, setCaption] = useState('');
  const [currenttime, setCurrenttime] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [indicator_color, setIndicatorColor] = useState('gray.80');
  const [indicator_label, setIndicatorLabel] = useState('Status');
  const [risk_level, setRisk_level] = useState('');
  const [s3Url, setS3Url] = useState('');

  const queryClient = useQueryClient();
  const getPromptsQuery = useQuery({
    queryKey: ['prompts'],
    queryFn: getPrompts,
  });
  const selectedId = getPromptsQuery.data?.selectedId;
  const putPromptMutation = useMutation({
    mutationFn: putPrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });

  const fetchData = async () => {
    try {
      const response = await fetchAuth(captionApiEndpoint);
      const data = await response.json();
      setCaption(data['caption']['S']);
    
      // timestamp 처리
      const rawTimestamp = data['timestamp']['S'];
      console.log("Raw Timestamp:", rawTimestamp); // 디버깅용 로그
  
      let formattedKST;
      try {
        // Unix timestamp (밀리초 또는 초 단위)로 가정하고 처리
        let floatTimestamp = parseFloat(rawTimestamp);
  
        if (floatTimestamp > 1e10) {
          // 밀리초 단위로 가정 (10자리 이상일 경우)
          floatTimestamp = Math.floor(floatTimestamp / 1000); // 초 단위로 변환
        }
  
        // UTC 기준 Date 객체 생성
        const eventDate = new Date(floatTimestamp * 1000); // 초 단위에서 밀리초로 변환
  
        // UTC를 KST로 변환
        //const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  
        // 포맷팅된 KST 날짜 문자열 생성
        formattedKST = eventDate.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Seoul',
        });
      } catch (error) {
        console.error("Timestamp parsing error:", error);
        formattedKST = "Invalid timestamp";
      }
  
      setCurrenttime(formattedKST);
      
      const recog = JSON.parse(
        data['rekognition_labels']['S'].replace(/'/g, '"')
      );
      setLabels(recog['Labels'].map((x: any) => x['Name']));

      // hazardous status indicator
      const classification = data['classification']['S'].trim();
      if (classification == '1') {
        setIndicatorColor('red.400');
        setIndicatorLabel('Status: 위험');
      } else {
        setIndicatorColor('green.500');
        setIndicatorLabel('Status: 정상');
      }
      // risk level
      const risk_level = data['risk_level']['S'].trim();
      setRisk_level(risk_level);
      // set S3 URL
      const imageFileName = data['s3_location']['S'].split('/').slice(-1)[0];
      setS3Url(`${cloudfrontUrl}images/${imageFileName}`);
    } catch (error) {
      console.error('/stream error', error);
    }
  };

  useEffect(() => {
    if (isUpdated) {
      fetchData();
      const pollingTimer = setInterval(fetchData, pollingInterval);
      return () => {
        clearInterval(pollingTimer);
      };
    }
  }, [pollingInterval, isUpdated]);

  const imageHeight = 400;

  const handleSwitch = () => {
    setIsUpdated(!isUpdated);
  };

  const handleIntervalChange = (interval: string) => {
    setPollingInterval(parseInt(interval));
  };

  const handlePromptSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    putPromptMutation.mutate({
      selectedId: selectedId,
    });
  };

  return (
    <Box p={6} maxW="1400px" mx="auto">
      <Box 
        bg="white" 
        borderRadius="xl" 
        boxShadow="lg" 
        p={6}
        mb={6}
      >
        <Accordion allowToggle defaultIndex={0}>
          <AccordionItem border="none">
            <AccordionButton 
              bg="blue.500" 
              color="white" 
              _hover={{ bg: "blue.600" }}
              borderRadius="lg"
              p={4}
            >
              <Box flex="1" textAlign="left" fontSize="lg" fontWeight="bold">
                제어판
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel py={6}>
              <Flex justify="center" align="center" gap={8}>
                <FormControl maxW="250px">
                  <HStack spacing={4}>
                    <FormLabel 
                      fontSize="md" 
                      fontWeight="medium"
                      mb="0"
                      whiteSpace="nowrap"
                    >
                      업데이트 주기 (초)
                    </FormLabel>
                    <NumberInput 
                      value={pollingInterval/1000}
                      onChange={handleIntervalChange}
                      min={1}
                      max={60}
                      w="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
                  </HStack>
                </FormControl>
                <FormControl display="flex" alignItems="center" maxW="250px">
                  <FormLabel mb={0} mr={4} fontSize="md" fontWeight="medium">
                    자동 업데이트
                  </FormLabel>
                  <Switch 
                    isChecked={isUpdated}
                    onChange={handleSwitch}
                    colorScheme="orange"
                    size="lg"
                  />
                </FormControl>
              </Flex>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Box>

      <Flex 
        gap={6} 
        direction={{ base: "column", lg: "row" }}
        align="stretch"
      >
        <Box flex="1">
          <Card p={6} h="100%" bg="white" borderRadius="xl" boxShadow="lg">
            <AnnotatedImage
              s3Url={s3Url}
              height={imageHeight}
            />
          </Card>
        </Box>

        <Box flex="1">
          <Card p={6} h="100%" bg="white" borderRadius="xl" boxShadow="lg">
            <VisualChat
              caption={caption}
              labels={labels}
              indicator_color={indicator_color}
              indicator_label={indicator_label}
              currenttime={currenttime}
              risk_level={risk_level}
            />
          </Card>
        </Box>
      </Flex>
    </Box>
  );
}

interface AnnotatedImageProps {
  s3Url: string;
  height: number;
}

function AnnotatedImage(props: AnnotatedImageProps) {
  return (
    <VStack spacing={6} align="stretch">
      <Heading size="lg" textAlign="center">
        실시간 CCTV 캡쳐
      </Heading>
      <Box borderRadius="lg" overflow="hidden">
        <Image
          src={props.s3Url}
          alt="CCTV의 캡쳐 이미지를 통한 사고 감지"
          height={`${props.height}px`}
          width="100%"
          objectFit="cover"
        />
      </Box>
    </VStack>
  );
}

interface VisualChatProps {
  caption: string;
  labels: string[];
  indicator_color: string;
  indicator_label: string;
  currenttime: string;
  risk_level: string;
}

function VisualChat(props: VisualChatProps) {
  return (
    <VStack spacing={6} align="stretch">
      <Heading size="lg" textAlign="center">
        상황 분석 powered by Claude 3.7 Sonnet
      </Heading>
      
      <Box
        p={4}
        bg={props.indicator_color}
        borderRadius="lg"
        color="white"
      >
        <Heading size="md" textAlign="center">
          {props.indicator_label},  Level : {props.risk_level} / 10
        </Heading>
      </Box>

      <Card
        variant="elevated"
        p={6}
        bg="gray.50"
        height="400px"
        overflowY="auto"
      >
        <VStack align="stretch" spacing={4}>
          <Box>
            <Heading size="md" mb={2}>상황 설명:</Heading>
            <Text fontSize="md" whiteSpace="pre-line">{props.caption}</Text>
          </Box>
          
          <Box>
            <Heading size="md" mb={2}>CCTV 위치:</Heading>
            <Text>1234</Text>
          </Box>

          <Box>
            <Heading size="md" mb={2}>발생 장소:</Heading>
            <Text>2층 로비</Text>
          </Box>

          <Box>
            <Heading size="md" mb={2}>발생 시각:</Heading>
            <Text>{props.currenttime}</Text>
          </Box>
        </VStack>
      </Card>

      <Flex flexWrap="wrap" gap={2}>
        {props.labels?.map((label) => (
          <Tag
            key={label}
            size="md"
            borderRadius="full"
            variant="solid"
            colorScheme="blue"
          >
            {label}
          </Tag>
        ))}
      </Flex>
    </VStack>
  );
}